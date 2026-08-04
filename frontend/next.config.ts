import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import path from "path";

const nextConfig: NextConfig = {
	poweredByHeader: false,
	compress: true,
	images: {
		formats: ['image/webp', 'image/avif'],
		minimumCacheTTL: 7200,
	},
	output: 'standalone',
	// Monorepo: ensure file tracing resolves from workspace root.
	outputFileTracingRoot: path.join(__dirname, ".."),
	// viewTransition was dropped from experimental in Next 16; it is reported as
	// an unrecognised key and fails the type check. View transitions come from
	// the next-view-transitions package, so nothing here depends on the flag.
	experimental: {
		nextScriptWorkers: true,
		staticGenerationMaxConcurrency: 8,
	},
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=3600, stale-while-revalidate=86400',
					},
				],
			},
			{
				source: '/api/(.*)',
				headers: [
					{
						key: 'Cache-Control',
						value: 'public, max-age=300, stale-while-revalidate=600',
					},
				],
			},
		];
	},
};

export default withSerwist(nextConfig);
