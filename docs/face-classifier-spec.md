# Face gestures you define: spec

Instead of eight predefined gestures, the person defines their own: they name a gesture, record
themselves doing it while playing, and map it to Next, Back or None. A small network, trained on
their recordings, turns the camera's frames into one number per gesture, `y_k`, from 0 to 1, which
feeds the existing turning machinery (On, Release, Hold, the 100 ms gate).

The network, in order:

1. **Timing**: the frames are resampled, causally, onto an even 15 Hz grid.
2. **Pose**: the head's pose is tared against its neutral pose (followed slowly, by slerp), and
   encoded as a 6D rotation and a translation.
3. **Baseline**: a small network, trained self-supervised on the background, predicts the
   blendshapes the camera angle alone would give; that is subtracted.
4. **Filter**: two dilated causal convolutions (467 ms of history), modulated by the pose (FiLM),
   take out short impulses.
5. **Latch**: a stateful GRU holds a gesture's state while it is held.
6. **Head**: an embedding, one prototype per gesture, and a sigmoid per gesture, so that anything
   unlike every gesture (an action never recorded) scores low on all of them.

This spec covers the classifier, recording, training and its checks, and the prototype test page.
Folding it into the app (the dialog, the reader, the kv store) is for a later spec; until then the
app keeps its eight gestures.

## Terms

- **Frame**: what MediaPipe's Face Landmarker gives for one camera image with a face in it: its time
  `t` (ms, the camera's capture time where the browser gives it), the 52 blendshape scores `b`, and
  the face's transform: a rotation `R` (3×3) and a position `p` (cm, in the camera's space; a face in
  front of the camera has `p_z < 0`). Frames without a face are dropped.
- **Tick**: one point of the 15 Hz grid (every 66.7 ms), with values interpolated from the frames
  (below). Everything after timing works on ticks.
- **Bag**: one recording, at 30 frames a second. There are three kinds:
  - **Co-occurring background**: the person playing as they would while using the gestures.
  - **Other-motion background**: the person playing with whatever else they might do in front of
    the camera.
  - **Trial**: one repetition (**rep**) of one gesture, with its tones.
- **Background**: the frames of both background kinds, and the frames of trials labelled background
  (below).
- **Sequence**: a bag resampled onto one grid. Each bag gives two, on grids half a tick (33 ms)
  apart. The two are near-copies: anything held out is held out with both.
- **Held region**: the ticks of a trial labelled with its gesture (below).
- **Median, IQR, percentile**: over ticks, per dimension, unless said otherwise. IQR is the 75th
  percentile minus the 25th.

## Stage 1: timing

Frames arrive unevenly (the camera, the detector and the page's thread all jitter). They are
resampled onto an even grid, causally: a tick is produced only once a frame at or after it has
arrived, so it waits at most one frame.

- The grid starts at the first frame's time, `τ_0`, and has a tick every 66.7 ms.
- When a frame arrives at `t`, after a frame at `t_prev`, every tick `τ` with `t_prev < τ ≤ t` is
  produced, at the fraction `a = (τ − t_prev) / (t − t_prev)` between the two frames:
  - the blendshapes linearly;
  - the rotation by slerp from `R_prev` to `R`;
  - the position linearly.
- A **gap**: when `t − t_prev` is over 200 ms (no face, or the page stalled), no ticks are produced
  for it. The sequence ends there and a new one starts at `t`. Live, a gap lets every gesture go and
  resets the GRU's state (below).
- For training, each bag is resampled twice: from `τ_0` = its first frame, and from `τ_0` = its
  first frame plus 33.3 ms.

## Stage 2: pose

### The camera pose `u` (9 numbers)

What the camera's angle on the face is, for the baseline and the FiLM:

- the first two columns of `R` (6 numbers);
- `p_x / p_z`, `p_y / p_z`, `log(−p_z)`;
- standardized per dimension: minus the median over the background, divided by the IQR over the
  background, with the IQR at least 0.02 (the rotation entries and `log(−p_z)`) or 0.01 (the two
  ratios).

### The tare

The **neutral pose** is the head's rotation `R_n` and position `p_n` when it isn't gesturing.

- In training, each bag has its own: `R_n` is the mean of the first two columns of `R` over its
  ticks labelled background, made orthonormal by Gram–Schmidt (the first column normalized; the
  second made perpendicular to it and normalized; the third their cross product), and `p_n` the
  median of `p` over them.
- Live, it is set the same way from the first 15 ticks after the camera starts (nothing is turned
  until then), and then follows the person slowly, by slerp: on each tick on which no gesture is on,
  with `α = 1 − exp(−Δt / 15 s)`,
  - `R_n ← R_n · exp(α · log(R_nᵀ R))` (a step of `α` along the shortest rotation from `R_n` to `R`);
  - `p_n ← p_n + α · (p − p_n)`.
- The **tared pose**: the rotation `ΔR = R_nᵀ R` and the translation `Δp = R_nᵀ (p − p_n)`.

### The tared pose's encoding `q` (9 numbers)

- The **6D rotation**: the first two columns of `ΔR`, minus `(1, 0, 0)` and `(0, 1, 0)` so that the
  neutral pose is all zeros (6 numbers).
- `Δp` (3 numbers).
- Standardized like `u`, with the IQR at least 0.0175 (the rotation entries, about 1°) or 0.5 cm.

Where yaw, pitch and roll are shown or checked, they are the components of `ΔR`'s rotation vector
(axis times angle): pitch about `x`, yaw about `y`, roll about `z`.

## Stage 3: the baseline

The blendshapes' resting values move with the camera's angle on the face, non-linearly. A small
network learns that from the background alone, with the blendshapes themselves as the target (so no
labels are needed), and its prediction is subtracted.

- `g(u)`: a multilayer perceptron, 9 → 64 → 64 → 52, ReLU between, linear out.
- Trained on every background tick, before the main network and only once (not per fold, below),
  for 2000 steps of 256 ticks, with Adam (learning rate 0.001) and an L1 loss: the L1 loss makes it
  the conditional median, so that the playing's own expressions don't pull it.
- Where the background has little data at a camera angle, `g` is extrapolating, so it is shrunk
  toward the background's median. A Gaussian kernel over the background's `u`, thinned uniformly in
  time to at most 1200 ticks, with the bandwidth `h` the median distance between pairs of them (from
  at most 300 sampled), gives each tick an **effective sample size**,
  `N_eff = Σ_j exp(−‖u − u_j‖² / 2h²)`. Then, with `λ = N_eff / (N_eff + 5)`,
  `b0 = λ · g(u) + (1 − λ) · median(b over the background)`.
- The **pose-corrected blendshapes**: `b̃ = (b − b0) / s`, per channel, where `s` is the IQR of
  `b − b0` over the background divided by 1.349, at least the 10th percentile of that over the 52
  channels.

## Stage 4: the network

### Its input

Per tick, 61 numbers: `b̃` (52) and `q` (9), each clipped to ±10. And, for the FiLM, `u` (9).

### The filter

- A 1×1 convolution, 61 → 32 channels: `h0`.
- Two causal convolutions, kernel 3, 32 channels, zeros before the start of a sequence: the first
  with dilation 1, the second with dilation 2. Each is followed by ReLU, then **FiLM** (below), then
  dropout (0.1). Then `h0` is added to the second's output: `h2`.
- Each output sees 7 ticks: 467 ms. A twitch or a blink of one to three ticks is short beside that.
- **FiLM** (feature-wise linear modulation): a multilayer perceptron over the tick's `u`, 9 → 32 →
  128, ReLU between, gives `γ1, β1, γ2, β2` (32 each). After the first convolution, `h ← (1 + γ1) ⊙
  h + β1`; after the second, the same with `γ2, β2`. Its last layer starts at zero, so it starts as
  no change. This lets the camera angle change how strongly each feature responds, which a
  subtracted baseline can't.

### The latch

- A GRU, 32 → 32, over `h2`.
- Live, it is **stateful**: its state carries from tick to tick for as long as the sequence runs.
  It starts at zero when the camera starts and after a gap.
- In training, each window starts it at zero (below).

### The head

- The **embedding**: `e = W z + c`, 32 → 16, where `z` is the GRU's output.
- Each gesture `k` has a **prototype** `c_k` (16 numbers, learned), a radius `ρ_k` and a scale
  `a_k > 0` (learned; `a_k` through a softplus).
- `y_k = σ(a_k · (ρ_k − ‖e − c_k‖²))`: one sigmoid per gesture, not a softmax over them. The
  background is no class: it is whatever is far from every prototype, so the scores need not add up
  to 1, and an action never recorded, landing far from all of them, scores low on all of them.
- They start with `c_k` normal (standard deviation 1), `ρ_k = 0` and `a_k = 1`.

## The labels

Each tick of a trial, from its tones (below), where `t_up` is the time of the third rising tone and
`t_down` that of the third falling one:

- **Held** (its gesture): from `t_up + 500 ms` to `t_down − 500 ms`.
- **No label** (left out of the loss): within 500 ms of `t_up` or of `t_down`. The tones count down,
  so the change is expected, and it is taken to happen within that second.
- **Background** otherwise.

Every tick of a background bag is background. The **core** of a held region, for the checks, is
the held region itself.

## Training

When the person asks, and only then.

### Folds and the ensemble

- **Three folds**, stratified across reps: each gesture's trials, in the order recorded, go to folds
  1, 2, 3, 1, 2, 3, …; each background bag is cut into thirds by time, its first third to fold 1,
  and so on. Both sequences of a trial or a third go together.
- **Three models**: model `m` is trained on the two folds other than `m`, and checked on fold `m`.
  The baseline, the standardizations and the kernel are shared, from all the data.
- **The ensemble**: live, `y_k` is the mean of the three models' `y_k`. Each model keeps its own
  GRU state. So there is no fourth training on everything: between them the three have seen it all.

### Each model

With Adam (learning rate 0.002, epsilon 0.0001), for 150, 300 (the default) or 600 steps, each on a
batch of 16 windows of 96 ticks (6.4 s):

- Half the windows from trials, a quarter from co-occurring background, a quarter from other-motion
  background; each from a random sequence and place, its speed changed at random by up to ±10%
  (resampled linearly), and noise added to `b̃` (normal, standard deviation 0.05).
- Each window's neutral pose is turned by a random rotation of up to 3° before the tare, as the live
  tare drifts.
- The trial windows get the augmentations below.
- The GRU starts at zero in each window, so a window's first 15 ticks (1 s) don't count unless it
  starts at the start of its sequence.
- The loss:
  - binary cross-entropy for each gesture on each labelled tick: 1 on its own held ticks, 0 on every
    other labelled tick; each gesture's ones weighted by its zeros' count over its ones' count, at
    most 10;
  - plus 0.01 times the mean, over held ticks, of `‖e − c_k‖²` for their own gesture (it keeps each
    gesture's embeddings round its prototype, which the checks rely on);
  - plus 0.0001 times the sum of the squared weights.
- Gradients are clipped to a global norm of 5.

### The augmentations

From the co-occurring background, composed onto trial windows.

**Glance injection**, to half of the trial windows, for gestures that aren't pose gestures (below):

- Before training, **glances** are found in the co-occurring background: stretches where the tared
  rotation's angle is over 5°, each with 1 s either side.
- A glance is chosen at random, and a stretch of it as long as the window (from its start, padded
  with its last tick if it is shorter).
- The window's tared pose `q` is replaced by the glance's, tick by tick. Its camera pose `u` becomes
  the one the trial's neutral pose would give with the glance's tared pose on it: `R' = R_n ΔR_g`,
  `p' = p_n + R_n Δp_g`.
- The blendshapes get the shift the new angle would cause: `b' = b + b0(u') − b0(u)`.
- Note: then `b' − b0(u') = b − b0(u)`, so `b̃` is unchanged. In practice the injection replaces
  `q` and `u` and leaves `b̃` alone; what it teaches is that a glance during a gesture, through `q`
  and the FiLM, doesn't change the gesture.

A **pose gesture** is one whose held ticks' median yaw, pitch or roll is more than 8° from 0: its
pose is the gesture, so replacing it would wipe the gesture out.

**Impulses**, to 70% of the trial windows:

- Before training, **impulses** are found in the co-occurring background's `b̃`: a stretch of 1, 2
  or 3 ticks where some channel is more than 2.5 from the mean of the two ticks before and the two
  after, and those ticks either side differ by less than 1 in every channel (it comes back). Its
  shape is its ticks minus that mean (1 to 3 × 52 numbers). Taken greedily from the largest, not
  overlapping; at most 500 kept.
- One to three impulses, at random, are added to `b̃` at random ticks of the window's held region.
  The labels don't change: a blink in the middle of a held gesture is still the gesture.

## Turning

`y_k` feeds the same turning as the eight gestures do now: a gesture comes on when `y_k` reaches its
**On** level, stays on until `y_k` falls under its **Release** level, and turns the page in its
direction after being on for its **Hold**, once until let go, through the 100 ms gate. On defaults to
0.8 and Release to 0.5; Hold is set by training: over the background, with the ensemble, the longest
stretch each gesture would be on (with On 0.8 and Release 0.5), plus 100 ms, rounded up to 50 ms,
from 100 to 1500 ms. All three can be moved.

## Recording

At 30 frames a second, every camera frame, timed by the camera's capture time. Tones are in the same
clock.

- **Co-occurring background**: "Play as you would while using the gestures: glance at the music,
  breathe, move as you normally do", for 30, 60 or 120 s, after a 3 s countdown. Two minutes or more
  is recommended, and recorded before any gesture.
- **Other-motion background**: "Play, and do the other things you might in front of the camera:
  talk, sing, look up, look round, reach for something", the same lengths. One minute or more is
  recommended.
- More bags of either kind can be added; each kind can be cleared.
- **A gesture's trials**: a round of five trials in a row, while the person keeps playing. Each:
  - a quiet lead-in of 2 to 4 s (random);
  - three **rising tones**, a second apart (523, 659 and 784 Hz, 120 ms each, the third 250 ms):
    present the gesture on the third, and hold it;
  - a hold of 3 to 5 s (random), from the third rising tone to the third falling one, with the
    first two falling tones within it;
  - three **falling tones**, a second apart (784, 659 and 523 Hz, the same lengths): withdraw it on
    the third;
  - 2 s more.

  More rounds can be recorded (10 to 15 trials are recommended); a gesture's trials can be cleared.

## Checking

After training, from the three models, each on the fold it wasn't trained on.

### A gesture needing more samples

A gesture is flagged "record more trials", with the reason, when any of these hold:

- **Weak**: over its held-out reps, the mean of each rep's mean `y_k` over its core is under 0.78,
  or their standard deviation is over 0.18.
- **Unsure**: the three models disagree: the mean, over its core ticks (every rep), of the standard
  deviation of the three models' `y_k`, is over 0.12.
- **Too still**: its held ticks' variance of yaw, or of pitch, is under 25% of the co-occurring
  background's. Not checked for a pose gesture.
- **Fires on background**: its highest `y_k` on the held-out background is over 0.45.

And "record more trials" with no check at all when a gesture has fewer than three trials.

### Gestures that can't be told apart

For each pair of gestures `i`, `j`, an **overlap** is shown when either holds:

- **Cross-activation**: on `i`'s held-out cores, the mean `y_j` is over 0.35 (either way round).
- **Prototype distance**: in each model, `‖c_i − c_j‖` divided by the mean of `r_i` and `r_j`,
  where `r_k` is the root mean square of `‖e − c_k‖` over `k`'s training held ticks; averaged over
  the three models, under 1.5.

For each overlap, the **conflicting channels**: on `i`'s held-out cores, the gradient of `y_j` with
respect to the input, times the input (summed over the last 7 ticks' inputs, averaged over the cores'
ticks, in absolute value), per input channel; the five largest, by name (the 52 blendshape names,
and for `q`: `rot 1`–`rot 6`, `x`, `y`, `z`). And the same the other way round. They are what makes `j` respond to `i`'s gesture.

Also, live: **unfamiliar angle**, when `N_eff < 5`: the camera sees the face from an angle the
background doesn't cover: "record more background from here".

## The prototype

`public/face-classifier.html`, a page of its own like `face-signals.html`: MediaPipe's code and
TensorFlow.js (4.22.0) from jsDelivr, MediaPipe's WASM and the face model the app's own
(`mediapipe/`), nothing sent anywhere. The service worker leaves it alone. It has no tests.
TensorFlow.js has neither causal padding nor gradients for dilated convolutions, so each causal
convolution is the input shifted back by 0, d and 2d ticks, side by side, times the kernel; the GRU
is written out step by step for the same reason.

- **Camera**: start and stop; the front camera at 640×480, asking for 30 frames a second. Detection
  runs on every camera frame; the ticks come from the resampler.
- **Background**: record a bag of either kind (30, 60 or 120 s), after a 3 s countdown; clear each
  kind.
- **Gestures**: add one (a name and a direction); record a round of five trials; clear its trials;
  change its direction; remove it.
- **Train**: the number of steps per model; trains the baseline and then the three models, saying
  what it is doing and the loss; then shows, per gesture, its flags and their reasons and its Hold;
  the cross-activation table and the prototype distances; and, for each overlap, its conflicting
  channels.
- **Try**: live, a tick at a time, through the ensemble with each model's GRU state carried: per
  gesture a meter of `y_k`, its On, Release and Hold (editable), whether it is on; the tared yaw,
  pitch and roll, `N_eff`, and whether a face is seen; a page number that turns, and which gesture
  turned it.
- **Data**: the bags and gestures are kept in the page's own IndexedDB database
  (`face-classifier-prototype`), not the app's, as float32; they can be downloaded as JSON and loaded
  back. The trained models aren't kept: train again after reloading. Recordings from the earlier
  versions (one kind of Playing, one tone each way) are dropped.

## Decisions not discussed

- The baseline and the FiLM take the camera pose `u`, not the tared pose: the blendshapes' bias
  comes from the camera's angle on the face, which the tare takes out. The network's own input has
  the tared pose `q`, so that pose gestures can be learned.
- The baseline is shrunk toward the background's median where `N_eff` is low, so that it doesn't
  extrapolate at angles the background never saw. It is trained once, on all the background,
  including the held-out folds' (it uses no labels).
- The transition is taken as the second centred on the third tone (±500 ms).
- The hold is 3 to 5 s, at random, so that the GRU can't learn to let go after a fixed time.
- Of the two ways to check (three folds, or three bootstrap heads), three folds: their held-out
  scores are honest, which frozen-backbone heads' wouldn't be, and the three fold models are also
  the three heads whose disagreement is checked, and, averaged, the live model. It costs three
  trainings.
- Pose gestures (median tared angle over 8°) get no glance injection and no stillness check.
- "Disagreement" is the standard deviation of the three models' scores; "cross-activation" is the
  mean over the core; "normalized" prototype distance is over the mean RMS radius of the two.
- Impulses are added only to held regions, as asked; the background already has its own.
- The live tare follows only on ticks on which no gesture is on, so a held head turn doesn't move
  it.
