// The Face gestures dialog as the library and the reader open it: face/ has the dialog, and this
// gives it what it can't reach from below, the library's scores to pick a page from (Play from).

import { openFaceGestures as openDialog } from '../face/dialog';
import { playFrom } from './_face-play-from';

/** Open the Face gestures dialog; `closed` is called when it closes, however. */
export const openFaceGestures = (closed?: () => void): void => openDialog(closed, playFrom);
