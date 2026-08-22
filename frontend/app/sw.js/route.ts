export async function GET(request: Request) {
	const url = new URL(request.url);
	url.pathname = "/serwist/sw.js";
	return fetch(url);
}

