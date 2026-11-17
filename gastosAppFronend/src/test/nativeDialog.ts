/**
 * jsdom does not implement `HTMLDialogElement.showModal()` / `close()`. This stand-in follows
 * the two parts of the HTML dialog algorithms that the Modal relies on:
 *  - `showModal()` remembers the element that had focus (the opener) and opens the dialog;
 *  - `close()` returns focus to that element if it is still in the document and enabled.
 * It does NOT emulate the top layer, inertness of the page, the focus trap or `closedby`.
 */
export interface NativeDialogStub {
  /** `showModal` and `close:connected` / `close:detached` in call order. */
  calls: string[]
  restore: () => void
}

type DialogMethods = { showModal?: () => void; close?: () => void }

export function installNativeDialog(): NativeDialogStub {
  const calls: string[] = []
  const proto = HTMLDialogElement.prototype as unknown as DialogMethods
  const previous = {
    showModal: Object.getOwnPropertyDescriptor(proto, 'showModal'),
    close: Object.getOwnPropertyDescriptor(proto, 'close'),
  }
  const openers = new WeakMap<HTMLDialogElement, Element | null>()

  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      calls.push('showModal')
      openers.set(this, document.activeElement)
      this.setAttribute('open', '')
    },
  })
  Object.defineProperty(proto, 'close', {
    configurable: true,
    writable: true,
    value(this: HTMLDialogElement) {
      calls.push(this.isConnected ? 'close:connected' : 'close:detached')
      this.removeAttribute('open')
      const opener = openers.get(this)
      if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) opener.focus()
    },
  })

  return {
    calls,
    restore() {
      for (const name of ['showModal', 'close'] as const) {
        const descriptor = previous[name]
        if (descriptor) Object.defineProperty(proto, name, descriptor)
        else delete proto[name]
      }
    },
  }
}

/** Makes `'closedBy' in HTMLDialogElement.prototype` true, as in browsers with native light dismiss. */
export function installClosedBySupport(): () => void {
  Object.defineProperty(HTMLDialogElement.prototype, 'closedBy', { configurable: true, writable: true, value: 'any' })
  return () => {
    delete (HTMLDialogElement.prototype as unknown as { closedBy?: string }).closedBy
  }
}

/** Gives the dialog a real box, since jsdom has no layout (every box is 0x0 at the origin). */
export function setDialogBox(dialog: HTMLElement, box: { left: number; top: number; right: number; bottom: number }) {
  dialog.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
      toJSON: () => box,
    }) as DOMRect
}
