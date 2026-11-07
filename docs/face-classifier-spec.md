# Face gestures you define: spec

Instead of eight predefined gestures, the person defines their own: they name a gesture, record
themselves doing it while playing, and map it to Next, Back or None. A classifier, trained on their
recordings, turns each camera frame into one number per gesture, `y_k`, from 0 to 1, which feeds the
existing turning machinery (On, Release, Hold, the 100 ms gate).

This spec covers the classifier, recording, training and its diagnostics, and a prototype test page
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
  **neutral** frames: those whose novelty `s_0` (stage 3) is under the 75th percentile of `s_0` over
  `D_bg`.
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

## Stage 2: features

- The 52 corrected blendshapes are regrouped:
  - 18 mirror pairs: `eyeBlink`, `eyeSquint`, `eyeWide`, `eyeLookUp`, `eyeLookDown`, `eyeLookIn`,
    `eyeLookOut`, `browDown`, `browOuterUp`, `cheekSquint`, `noseSneer`, `mouthSmile`, `mouthFrown`,
    `mouthDimple`, `mouthStretch`, `mouthPress`, `mouthLowerDown`, `mouthUpperUp` (each `…Left` and
    `…Right`);
  - 2 opposing pairs: `jawLeft`/`jawRight`, `mouthLeft`/`mouthRight`;
  - 12 midline channels: `_neutral`, `browInnerUp`, `cheekPuff`, `jawOpen`, `jawForward`,
    `mouthClose`, `mouthFunnel`, `mouthPucker`, `mouthRollLower`, `mouthRollUpper`,
    `mouthShrugLower`, `mouthShrugUpper`.
- Each pair becomes its **common** channel `(L + R) / 2` and its **difference** channel `(L − R) / 2`.
  The midline channels stay as they are.
- The standardized `Dr` is appended: 20 + 20 + 12 + 3 = 55 numbers, `v_t`.
- One continuous-time filter against jitter: `x_i = α · x_(i−1) + (1 − α) · v_i`, with
  `α = exp(−Δt / 45 ms)`, `Δt` the time since the series' previous frame. A series' first frame is
  `x = v`. (After a long gap `α` is about 0, so the series restarts by itself.)

## Stage 3: the classifier

### The background's statistics

- `μ0`: the median of `x` over `D_bg`; `IQR_bg`: its IQR.
- **Novelty**: `s_0(t) = ‖(x_t − μ0) / (IQR_bg + 0.001)‖₂`. Used to segment trials and to decide
  which frames are neutral for the mount.

### Per gesture `k`

From its **core frames** `C_k` (the held part of each trial, from segmentation below, both sets):

- `μ_k`: the median of `x` over `C_k`; `IQR_k`: its IQR; `δ_k = μ_k − μ0`;
  `s_d = IQR_k,d + IQR_bg,d + 0.001`.
- **Relevance** of each dimension: `ρ_k,d = max(0, |δ_k,d| / s_d − γ_null)`.
- `γ_null`, the relevance that chance alone gives: the trials of `k` and the background are cut into
  **units** (each trial's core frames is a unit; the background is cut into chunks of consecutive
  frames as long as the median core). 100 times, as many units as `k` has trials are picked at random
  and labelled as the gesture, the rest as background, and `|med − med| / s` is computed for every
  dimension. `γ_null` is the 95th percentile of all of those, over permutations and dimensions
  together.
- The **active** dimensions are those with `ρ_k,d > 0`. If none are, the gesture is **unreliable**:
  "nothing in it differs from playing".
- **Weights**: `w_d = δ_k,d / s_d²` on the active dimensions, 0 on the rest.
- **Transition coordinate**: `u_k(t) = Σ w_d (x_t,d − μ0,d) / Σ w_d δ_k,d`. About 0 on the
  background, about 1 on the core.
- **The residual gate**:
  - `r(t) = (x_t − μ0) − clip(u_k, 0, 1.2) · δ_k`;
  - `d_res(t) = mean over all 55 d of (r_d / s_d)²`;
  - `L` and `U`: the 90th and 99th percentiles of `d_res` over `C_k`;
  - `gate_k(t) = exp(−max(0, (d_res − L) / (U − L + 10⁻⁹)))`.
- **Calibration**: `upper` is the 98th percentile of `u_k` over the frames of `D_bg` whose gate is at
  least 0.5 (over all of `D_bg` if fewer than 50 are). Otherwise anything the gate rejects but that
  is more than 2% of playing would set `upper`: natural blinks lie along a wink's direction, take up
  more than 2% of the time, and would push `upper` past the wink itself. `lower` is the 20th
  percentile of `u_k` over `C_k`. If `lower ≤ upper`, the gesture is **unreliable**: "it overlaps
  with playing". Otherwise `a_k(t) = clip((u_k − upper) / (lower − upper), 0, 1)`.
- `y_k(t) = a_k(t) · gate_k(t)`.

### Turning

`y_k` feeds the same turning as the eight gestures do now: a gesture comes on when `y_k` reaches its
**On** level, stays on until `y_k` falls under its **Release** level, and turns the page in its
direction after being on for its **Hold**, once until let go, through the 100 ms gate. On is at most
1 and defaults to 1; Release defaults to 0.5; Hold is set by training (below). All three can be
moved. To make a gesture less sensitive than On = 1, record what sets it off as more Playing.

## Recording

At 30 frames a second, every camera frame, timed by the camera's capture time.

- **Playing**: "Play as you normally would", for 30, 60 or 120 s. More Playing bags can be added;
  all of them are the background. Playing is recorded before any gesture.
- **A gesture's trials**: five trial bags in a row, while the person keeps playing. Each: a quiet
  lead-in of 2 to 4 s (random), a **high tone** (880 Hz, 150 ms) meaning "do the gesture and hold
  it", 2 s, a **low tone** (440 Hz) meaning "let go", and 2 s more. Earphones are fine. More trials
  can be added; a gesture's trials can be cleared.

### Segmentation

The core of each trial, found from the even set, then applied to both sets by time:

1. **Search window**: from 200 ms after the high tone to 1 s after the low tone.
2. **First pass**: Otsu's threshold on `s_0` over the whole bag (64 bins). The core is the longest
   run, inside the window, of frames over it; frames over it less than 140 ms apart count as one run.
3. **Second pass**: `μ_k` and `δ_k` from the union of the first pass's cores; weights `δ_k,d / s_d²`
   on every dimension (no `γ_null` yet); `u_k` over each bag; Otsu's threshold on `u_k` over the bag,
   and the longest run in the window as before. This is the core.

A trial with no run in its window is left out, and the diagnostics say so.

## Training and diagnostics

Training runs only when the person asks. It does stages 1 to 3 from the stored bags, then:

- **Hold**: on each set of each Playing bag, `y_k` run through On = 1 and Release = 0.5 gives
  stretches when the gesture would be on. Hold is the longest stretch plus 100 ms, rounded up to
  50 ms, from 100 to 1500 ms. Each trial (held out, below) should be on for longer than that; the
  diagnostics say how many are.
- **Leaving one trial out**: for each trial of `k`, `k` is trained again without it (its core, both
  sets; `γ_null` kept), and `y_k` is computed on it.
  - **Recall**: the fraction of held-out core frames with `y_k > 0.7`.
  - **Stability**: the jackknife standard error of `lower − upper` over the held-out fits, divided by
    the full fit's `lower − upper`.
  - If recall is under 0.85 or the relative error over 0.15: "record more trials of this gesture".
- **Confusable gestures**: `Ω_j,k` is the fraction of `j`'s held-out core frames on which `y_k`
  (trained on all of `k`) is over the 10th percentile of `k`'s own held-out core scores. If
  `max(Ω_j,k, Ω_k,j) > 0.15`: "`j` and `k` can't be told apart".
- **Unfamiliar angle**, live: when `N_eff,u < 5`, the camera sees the face from an angle the
  background doesn't cover: "record more Playing from here".

## The prototype

`public/face-classifier.html`, a page of its own like `face-signals.html`: the library's code from
jsDelivr, its WASM and the face model the app's own (`mediapipe/`), nothing sent anywhere. The
service worker leaves it alone. It has no tests.

- **Camera**: start and stop; the front camera at 640×480, asking for 30 frames a second.
- **Playing**: record a bag (30, 60 or 120 s), after a 3 s countdown; clear them.
- **Gestures**: add one (a name and a direction); record five trials; clear its trials; change its
  direction; remove it.
- **Train**: runs training, saying what it is doing, then shows, per gesture: trials segmented, the
  most relevant dimensions, `upper` and `lower`, recall, stability, Hold and the trials past it, and
  every warning above.
- **Try**: live at 15 frames a second: per gesture a meter of `y_k` with `u_k`, `a_k` and the gate,
  its On, Release and Hold (editable), whether it is on; `N_eff,u`, `s_0` and whether a face is seen;
  a page number that turns, and which gesture turned it.
- **Data**: the bags and gestures are kept in the page's own IndexedDB database
  (`face-classifier-prototype`), not the app's, as float32; they can be downloaded as JSON and loaded
  back. The trained model isn't kept: train again after reloading.
