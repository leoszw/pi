import { type Component, dispatchMouseEvent, type TuiMouseDispatchResult, type TuiMouseEvent } from "../tui.ts";

/** Maximum width source: a fixed number of columns or a live getter (settings can change). */
export type CenteredMaxWidth = number | (() => number);

type MouseLayout = {
	width: number;
	maxWidth: number;
	pad: number;
	childHeight: number;
};

/**
 * Centered - renders a single child in a column capped at maxWidth, horizontally
 * centered in the available width. Terminals at or below maxWidth render the
 * child unchanged (zero pad, full width), so narrow sessions keep today's layout.
 *
 * Mouse events are translated by the left pad so hit testing inside the child
 * (editors, mouse regions, scroll views) stays aligned with the shifted cells.
 */
export class Centered implements Component {
	child: Component;
	maxWidth: CenteredMaxWidth;

	private mouseLayout?: MouseLayout;

	constructor(child: Component, maxWidth: CenteredMaxWidth) {
		this.child = child;
		this.maxWidth = maxWidth;
	}

	invalidate(): void {
		this.mouseLayout = undefined;
		this.child.invalidate?.();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseDispatchResult | undefined {
		const { pad, innerWidth } = this.resolveGeometry(event.width);
		const contentX = event.x - pad;
		if (contentX < 0 || contentX >= innerWidth) return undefined;
		const childHeight = this.childHeight(event.width);
		if (event.y < 0 || event.y >= childHeight) return undefined;
		return dispatchMouseEvent(this.child, {
			...event,
			x: contentX,
			width: innerWidth,
			height: childHeight,
		});
	}

	render(width: number): string[] {
		const { pad, innerWidth } = this.resolveGeometry(width);
		const childLines = this.child.render(innerWidth);
		this.mouseLayout = { width, maxWidth: this.resolveMaxWidth(), pad, childHeight: childLines.length };
		if (pad === 0) return childLines;
		const leftPad = " ".repeat(pad);
		return childLines.map((line) => (line.length === 0 ? line : leftPad + line));
	}

	private resolveMaxWidth(): number {
		return typeof this.maxWidth === "number" ? this.maxWidth : this.maxWidth();
	}

	private resolveGeometry(width: number): { pad: number; innerWidth: number } {
		const maxWidth = this.resolveMaxWidth();
		if (maxWidth <= 0 || width <= maxWidth) return { pad: 0, innerWidth: Math.max(1, width) };
		const pad = Math.floor((width - maxWidth) / 2);
		return { pad, innerWidth: Math.max(1, width - pad * 2) };
	}

	private childHeight(width: number): number {
		const layout = this.mouseLayout;
		if (layout && layout.width === width && layout.maxWidth === this.resolveMaxWidth()) {
			return layout.childHeight;
		}
		const { innerWidth } = this.resolveGeometry(width);
		return this.child.render(innerWidth).length;
	}
}
