import { describe, expect, it, vi } from "vitest";

const next = vi.fn(() => "next");
const redirect = vi.fn(() => "redirect");
vi.mock("next/server", () => ({
	NextResponse: { next: () => next(), redirect: () => redirect() },
}));

describe("route middleware", () => {
	it("protects all nested academic routes", async () => {
		const { middleware } = await import("@/middleware");
		next.mockClear();
		redirect.mockClear();
		middleware({
			cookies: { get: () => undefined },
			nextUrl: { pathname: "/academia/library/resources" },
			url: "https://classpro.test/",
		} as never);
		expect(redirect).toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});

	it("does not treat unrelated academic-prefixed paths as protected", async () => {
		const { middleware } = await import("@/middleware");
		next.mockClear();
		redirect.mockClear();
		middleware({
			cookies: { get: () => undefined },
			nextUrl: { pathname: "/academia-guide" },
			url: "https://classpro.test/",
		} as never);
		expect(next).toHaveBeenCalled();
		expect(redirect).not.toHaveBeenCalled();
	});
});
