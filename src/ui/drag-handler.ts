/**
 * Drag functionality for video controller
 * Uses pointer events for unified mouse + touch support
 */

window.VSC = window.VSC || {};

class DragHandler {
  /**
   * Handle dragging of video controller via pointer events
   * @param {HTMLVideoElement} video - Video element
   * @param {PointerEvent|MouseEvent} e - Pointer/mouse event
   */
  static handleDrag(video: HTMLMediaElement, e: PointerEvent | MouseEvent): void {
    const controller = video.vsc?.div;
    if (!controller) {
      return;
    }
    const shadowController = controller.shadowRoot?.querySelector('#controller') as HTMLElement;

    video.classList.add('vcs-dragging');
    shadowController.classList.add('dragging');

    const initialXY = [e.clientX, e.clientY];
    const initialControllerXY = [
      parseInt(shadowController.style.left) || 0,
      parseInt(shadowController.style.top) || 0,
    ];
    const initialControllerRect = shadowController.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const videoRight = videoRect.right ?? videoRect.left + videoRect.width;
    const videoBottom = videoRect.bottom ?? videoRect.top + videoRect.height;
    const canClampToVideo =
      videoRect.width > 0 &&
      videoRect.height > 0 &&
      initialControllerRect.width > 0 &&
      initialControllerRect.height > 0;

    const draggable = e.target as HTMLElement & {
      setPointerCapture?: (pointerId: number) => void;
    };
    const isPointerEvent = 'pointerId' in e && typeof e.pointerId === 'number';

    // Capture pointer so all move/up events route here regardless of position
    if (isPointerEvent) {
      draggable.setPointerCapture?.(e.pointerId);
    }

    const onMove = (ev: Event) => {
      const pointer = ev as PointerEvent | MouseEvent;
      const dx = pointer.clientX - initialXY[0];
      const dy = pointer.clientY - initialXY[1];

      let left = initialControllerXY[0] + dx;
      let top = initialControllerXY[1] + dy;

      if (canClampToVideo) {
        const desiredLeft = initialControllerRect.left + dx;
        const desiredTop = initialControllerRect.top + dy;
        const maxLeft = Math.max(videoRect.left, videoRight - initialControllerRect.width);
        const maxTop = Math.max(videoRect.top, videoBottom - initialControllerRect.height);
        const clampedLeft = Math.min(Math.max(desiredLeft, videoRect.left), maxLeft);
        const clampedTop = Math.min(Math.max(desiredTop, videoRect.top), maxTop);

        left = initialControllerXY[0] + (clampedLeft - initialControllerRect.left);
        top = initialControllerXY[1] + (clampedTop - initialControllerRect.top);
      }

      shadowController.style.left = `${left}px`;
      shadowController.style.top = `${top}px`;
    };

    const onEnd = (): void => {
      draggable.removeEventListener('pointermove', onMove);
      draggable.removeEventListener('pointerup', onEnd);
      draggable.removeEventListener('pointercancel', onEnd);
      // Mouse fallbacks
      draggable.removeEventListener('mousemove', onMove);
      draggable.removeEventListener('mouseup', onEnd);

      shadowController.classList.remove('dragging');
      video.classList.remove('vcs-dragging');

      window.VSC.logger.debug('Drag operation completed');
    };

    if (isPointerEvent) {
      draggable.addEventListener('pointermove', onMove);
      draggable.addEventListener('pointerup', onEnd);
      draggable.addEventListener('pointercancel', onEnd);
    } else {
      // Fallback for environments without pointer events
      draggable.addEventListener('mousemove', onMove);
      draggable.addEventListener('mouseup', onEnd);
    }

    window.VSC.logger.debug('Drag operation started');
  }
}

// Create singleton instance
window.VSC.DragHandler = DragHandler;
