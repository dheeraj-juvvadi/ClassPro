import React from "react";
import { fetchUserData } from "@/hooks/fetchUserData";
import GradeCalculator from "./components/GradeCalculator";

export default async function GradeX() {
    const json = await fetchUserData();
    const marks = json.marks?.marks
    const courses = json.courses?.courses

    return <div className="flex flex-col gap-12 h-screen px-3 py-2">
        <GradeCalculator marks={marks} courses={courses} />
    </div>;
}
