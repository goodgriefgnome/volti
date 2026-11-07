# Face gestures you define: spec

Instead of eight predefined gestures, the person defines their own: they name a gesture, record
themselves doing it while playing, and map it to Next, Back or None. A classifier, trained on their
recordings (a small temporal convolutional network over the pose-corrected blendshapes and the head's
rotation), turns each camera frame into one number per gesture, `y_k`, from 0 to 1, which feeds the
existing turning machinery (On, Release, Hold, the 100 ms gate).

This spec covers the classifier, recording, training and its checks, and a prototype test page
to try them. Folding it into the app (the dialog, the reader, the kv store) is for a later spec;
until then the app keeps its eight gestures.

## Terms

- **Frame**: what MediaPipe's Face Landmarker gives for one camera image with a face in it: its time
  `t` (ms, the camera's capture time where the browser gives it), the 52 blendshape scores `b`, and
  the face's transform: a rotation `R` (3×3) and a position `p` (cm, in the camera's space; a face in
  front of the camera has `p_z < 0`). Frames without a face are dropped.
- **Bag**: one recording. A **Playing bag** is the person playing normally; a **trial bag** is one
  attempt at one gesture.
- **Sets**: bags are recorded at 30 frames a second, and each is split into two series at 15 frames
  a second: its even frames and its odd frames. Each set is processed as a series of its own, so that
  training sees what live use sees (15 a second). The two sets of a bag are near-copies: anything
  held out is held out with both.
- **Background**, `D_bg`: the frames of every Playing bag, both sets.
- **Median, IQR, percentile**: over frames, per dimension, unless said otherwise. IQR is the 75th
  percentile minus the 25th.

## Stage 1: pose

### Camera pose `u` (9 numbers)

- The first two columns of `R` (6 numbers).
- `p_x / p_z`, `p_y / p_z`, `log(−p_z)`.
- Standardized per dimension: minus the median over `D_bg`, divided by the IQR over `D_bg`, with the
  IQR at least 0.02 (the rotation entries and `log(−p_z)`) or 0.01 (the two ratios).

### The mount and the relative pose `Dr` (3 numbers)

- The **mount**, `R_b0`, is the head's neutral rotation. Training sets it from the Playing bags: the
  mean of the first two columns of `R` over their frames, made orthonormal by Gram–Schmidt (the first
  column normalized; the second made perpendicular to it and normalized), with the third column their
  cross product.
- Live, it follows the person slowly: an exponential moving average of the first two columns of `R`,
  with a time constant of 15 s, made orthonormal the same way after each update. It updates only on
  **neutral** frames: those whose **novelty** `s_0` is under the 75th percentile of `s_0` over
  `D_bg`. `s_0 = ‖(v − μ0) / (IQR_bg + 0.001)‖₂`, where `v` is the frame's 55 inputs to the network
  (stage 2), and `μ0` and `IQR_bg` their median and IQR over `D_bg`.
- `Dr` is the rotation vector (axis times angle, in radians) of `R_b0ᵀ R`: about pitch, yaw and roll
  from the mount.
- Standardized like `u`, with the IQR at least 0.0175 (1°).

### The pose baseline

The blendshapes' resting values move with the pose. Stage 1 removes that with kernel regression over
the background.

- The **kernel set**: `D_bg` thinned uniformly in time to at most 1200 frames, each with its
  standardized `u`, standardized `Dr` and `b`.
- Two Gaussian kernels: one over `u`, one over `Dr`. Each kernel's **bandwidth** `h` is the median
  distance between pairs of kernel-set points in its space (from at most 300 points sampled).
- For a frame, each kernel's weights are `exp(−‖u − u_j‖² / 2h²)` (likewise for `Dr`), normalized by
  a numerically stable softmax. Its **effective sample size** `N_eff` is their sum before
  normalizing. Each gives a weighted mean of `b` and a weighted variance.
- The two are **blended**, each shrunk toward the background as a whole where it has little data:
  - `λ_u = N_eff,u / (N_eff,u + 5)`, `λ_r = N_eff,r / (N_eff,r + 5)`;
  - `b0 = λ_u · mean_u + (1 − λ_u) · (λ_r · mean_r + (1 − λ_r) · median(b over D_bg))`;
  - the variance `σ0²` the same way, with `(IQR(b over D_bg) / 1.349)²` as the background's.
- The **pose-corrected blendshapes**: `b̃ = (b − b0) / (σ0 + ε)`, where `ε` is the 10th percentile,
  over the 52 channels, of `IQR(b over D_bg) / 1.349`.
- For a frame of `D_bg` itself, kernel-set points from the same bag within 70 ms of it are left out,
  so that a frame (and its twin in the other set, and its neighbours) is never its own baseline.

## Stage 2: the network

The first version classified each gesture against Playing alone (a projection onto its difference
from Playing, and a residual gate), and gestures that share part of that difference couldn't be told
apart. Stage 2 is now one network trained to tell every gesture from every other and from Playing.

### Its input

Per frame, 55 numbers: the 52 pose-corrected blendshapes `b̃` and the standardized `Dr`, each clipped
to ±10. No filtering: the network does its own smoothing.

### The network

A small causal **temporal convolutional network** (TCN): its output at a frame depends only on that
frame and earlier ones.

- Three residual blocks, with dilations 1, 2 and 4. Each block: two causal convolutions (kernel 3,
  32 channels, zeros before the start of a series), each followed by ReLU and dropout (0.2); then the
  block's input added (through a 1×1 convolution in the first block, where the channel count
  changes).
- A 1×1 convolution to one logit per class, and a softmax: the classes are **Playing** and each
  gesture.
- Each output sees 29 frames back: about 2 s at 15 frames a second.
- `y_k` is the softmax's probability of gesture `k`.

### The labels

- Every frame of a Playing bag is Playing.
- A trial's frames, from its tones: the gesture from 400 ms after the high tone to 200 ms after the
  low tone; no label (left out of the loss) from 100 ms after the high tone to 400 ms after it, and
  from 200 ms to 500 ms after the low tone; Playing otherwise.

### Training

When the person asks, and only then. Before training, from the stored bags:

- **Held out**, for checking (below): the last 20% of each set of each Playing bag, and each
  gesture's most recent trial (both sets) when it has two or more.
- **Sequences**: everything else, each set of each bag a sequence of its own.

Then, with Adam (learning rate 0.001, epsilon 0.0001), for 400, 800 (the default) or 1600 steps, each
on a batch of 32 windows of 96 frames:

- Half the windows from trials, half from Playing; each from a random sequence and place, its speed
  changed at random by up to ±10% (resampled linearly), the blendshapes scaled by a random factor
  from 0.9 to 1.1, and noise added (normal, standard deviation 0.1).
- A window's first 28 frames don't count unless it starts at the start of its sequence (they have no
  history).
- The loss: softmax cross-entropy with label smoothing of 0.05, each frame weighted by its class's
  weight, the total count of labelled frames over (classes × that class's count), at most 10; plus
  0.0001 times the sum of the squared convolution weights. Gradients are clipped to a global norm
  of 5.

## Turning

`y_k` feeds the same turning as the eight gestures do now: a gesture comes on when `y_k` reaches its
**On** level, stays on until `y_k` falls under its **Release** level, and turns the page in its
direction after being on for its **Hold**, once until let go, through the 100 ms gate. On defaults to
0.8 and Release to 0.5; Hold is set by training: on the Playing sequences used for training, the
longest stretch each gesture would be on (with On 0.8 and Release 0.5), plus 100 ms, rounded up to
50 ms, from 100 to 1500 ms. All three can be moved.

## Recording

At 30 frames a second, every camera frame, timed by the camera's capture time.

- **Playing**: "Play as you normally would", for 30, 60 or 120 s. More Playing bags can be added;
  all of them are the background. Playing is recorded before any gesture; two minutes or more is
  recommended.
- **A gesture's trials**: five trial bags in a row, while the person keeps playing. Each: a quiet
  lead-in of 2 to 4 s (random), a **high tone** (880 Hz, 150 ms) meaning "do the gesture and hold
  it", 2 s, a **low tone** (440 Hz) meaning "let go", and 2 s more. Earphones are fine. More rounds
  can be recorded (10 to 15 trials are recommended); a gesture's trials can be cleared.

## Checking

After training, on what was held out:

- **Crosstalk**: for each gesture's held-out trial, how many times each gesture would have turned
  the page, with its On, Release and Hold. Its own gesture should have once; every other, never.
  Also its own highest probability during the gesture.
- **False turns**: on the held-out Playing, the turns per minute each gesture would have made.
- **Warnings**: a gesture with fewer than 10 trials ("record more trials"), or only one (nothing to
  check it with).
- **Unfamiliar angle**, live: when `N_eff,u < 5`, the camera sees the face from an angle the
  background doesn't cover: "record more Playing from here".

## The prototype

`public/face-classifier.html`, a page of its own like `face-signals.html`: MediaPipe's code and
TensorFlow.js (4.22.0, about 1.5 MB) from jsDelivr, MediaPipe's WASM and the face model the app's
own (`mediapipe/`), nothing sent anywhere. The service worker leaves it alone. It has no tests.
TensorFlow.js has neither causal padding nor gradients for dilated convolutions, so the network is
written with plain tensor operations: each causal convolution is the input shifted back by 0, d and
2d frames, side by side, times the kernel.

- **Camera**: start and stop; the front camera at 640×480, asking for 30 frames a second.
- **Playing**: record a bag (30, 60 or 120 s), after a 3 s countdown; clear them.
- **Gestures**: add one (a name and a direction); record five trials; clear its trials; change its
  direction; remove it.
- **Train**: the number of steps; runs training, saying what it is doing and the loss, then shows
  the crosstalk table, the false turns, each gesture's Hold, and the warnings.
- **Try**: live at 15 frames a second, the network run over the last 37 frames for each: per gesture
  a meter of `y_k`, its On, Release and Hold (editable), whether it is on; `N_eff,u`, `s_0`, the
  probability of Playing, and whether a face is seen; a page number that turns, and which gesture
  turned it.
- **Data**: the bags and gestures are kept in the page's own IndexedDB database
  (`face-classifier-prototype`), not the app's, as float32; they can be downloaded as JSON and loaded
  back. The trained network isn't kept: train again after reloading. On, Release and Hold set for the
  first version are dropped.
