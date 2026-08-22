import type { ProscrapeError } from "./Error";

export type MarksResponse = SuccessMarksResponse & ProscrapeError;
export interface SuccessMarksResponse {
	marks: Mark[];
	requestedAt: number | null;
}

export interface Mark {
	courseName: string;
	courseCode: string;
	courseType: string;
	overall: Marks;
	testPerformance: TestPerformance[];
}

export interface TestPerformance {
	test: string;
	marks: Marks;
}

export interface Marks {
	scored?: string;
	total: string;
}
