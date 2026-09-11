import assert from "node:assert";
import { describe, it } from "node:test";
import { Centered } from "../src/components/centered.ts";
import { Text } from "../src/index.ts";
import type { Component, TuiMouseEvent, TuiMouseEventType } from "../src/tui.ts";

function mouse(type: TuiMouseEventType, x: number, y: number, width = 80, height = 10): TuiMouseEvent {
	return {
		type,
		button: "left",
		x,
		y,
		screenX: x,
		screenY: y,
		width,
		height,
		shift: false,
		alt: false,
		ctrl: false,
		...(type === "click" ? { clickCount: 1 } : {}),
	};
}

/** Records mouse events and renders fixed lines, for asserting forwarded geometry. */
class MouseProbe implements Component {
	lastEvent?: TuiMouseEvent;

	handleMouse(event: TuiMouseEvent) {
		this.lastEvent = event;
		return { handled: true };
	}

	invalidate(): void {}

	render(width: number): string[] {
		return ["x".repeat(Math.min(width, 20))];
	}
}

/** Renders fixed lines regardless of width, so line-shape assertions are exact. */
class FixedLines implements Component {
	lines: string[];

	constructor(lines: string[]) {
		this.lines = lines;
	}

	invalidate(): void {}

	render(): string[] {
		return this.lines;
	}
}

describe("Centered", () => {
	it("renders unchanged when terminal is at or below maxWidth", () => {
		const child = new Text("hello", 0, 0);
		const centered = new Centered(child, 20);
		assert.deepStrictEqual(centered.render(20), child.render(20));
		assert.deepStrictEqual(centered.render(10), child.render(10));
	});

	it("centers child lines with symmetric left pad on wide terminals", () => {
		const centered = new Centered(new FixedLines(["hello", ""]), 20);
		// pad = floor((30 - 20) / 2) = 5; child renders at 20; empty lines stay unpadded
		assert.deepStrictEqual(centered.render(30), ["     hello", ""]);
	});

	it("accepts a maxWidth getter and applies it per render", () => {
		let maxWidth = 20;
		const centered = new Centered(new FixedLines(["hello"]), () => maxWidth);
		assert.strictEqual(centered.render(30)[0], " ".repeat(5) + "hello");
		maxWidth = 10;
		// pad = floor((30 - 10) / 2) = 10; child renders at 10
		assert.strictEqual(centered.render(30)[0], " ".repeat(10) + "hello");
	});

	it("renders full width when maxWidth is 0", () => {
		const child = new Text("hello", 0, 0);
		const centered = new Centered(child, 0);
		assert.deepStrictEqual(centered.render(80), child.render(80));
	});

	it("translates mouse x by the left pad and narrows width", () => {
		const probe = new MouseProbe();
		const centered = new Centered(probe, 20);
		const result = centered.handleMouse(mouse("click", 7, 0, 30, 1));
		assert.ok(result?.handled);
		assert.strictEqual(probe.lastEvent?.x, 2);
		assert.strictEqual(probe.lastEvent?.width, 20);
		assert.strictEqual(probe.lastEvent?.screenX, 7);
	});

	it("ignores clicks in the side margins", () => {
		const probe = new MouseProbe();
		const centered = new Centered(probe, 20);
		// pad = 5: column spans x in [5, 25)
		assert.strictEqual(centered.handleMouse(mouse("click", 4, 0, 30, 1)), undefined);
		assert.strictEqual(centered.handleMouse(mouse("click", 25, 0, 30, 1)), undefined);
		assert.strictEqual(probe.lastEvent, undefined);
	});

	it("passes mouse events through when pad is zero", () => {
		const probe = new MouseProbe();
		const centered = new Centered(probe, 20);
		const result = centered.handleMouse(mouse("click", 3, 0, 20, 1));
		assert.ok(result?.handled);
		assert.strictEqual(probe.lastEvent?.x, 3);
		assert.strictEqual(probe.lastEvent?.width, 20);
		assert.strictEqual(probe.lastEvent?.screenX, 3);
	});
});
