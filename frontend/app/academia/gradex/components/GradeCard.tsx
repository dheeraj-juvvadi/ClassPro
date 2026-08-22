import React, { useEffect, useState, useMemo, memo } from "react";
import { Slider } from "@/components/ui/slider";
import { Mark } from "@/types/Marks";
import Medal from "./Medals";
import { getGrade } from "@/types/Grade";
import { Course } from "@/types/Course";
import { MarkDisplay } from "../../components/Marks/Card/MarkElement";
import { determineGrade, gradePoints as sgpaGradePoints } from "@/utils/Grade";

// Grade point values for scoring calculation - moved outside component to prevent recreation
export const grade_points: { [key: string]: number } = {
    O: 91,
    "A+": 81,
    A: 71,
    "B+": 61,
    B: 56,
    C: 50,
};

export const medalStyles = {
    O: {
        text: "text-light-success-color dark:text-dark-success-color",
        bg: "bg-light-success-background dark:bg-dark-success-background",
        border: "border-light-success-color dark:border-dark-success-color border",
    },
    "A+": {
        text: "text-gray-500 dark:text-gray-400",
        bg: "bg-gray-200 dark:bg-gray-700",
        border: "border-gray-300 dark:border-gray-600 border",
    },
    A: {
        text: "text-light-color dark:text-dark-color",
        bg: "bg-light-background-normal dark:bg-dark-background-light",
        border:
            "border-light-color dark:border-dark-color border border-opacity-30 dark:border-opacity-20",
    },
    "B+": {
        text: "text-light-color dark:text-dark-color",
        bg: "bg-light-background-normal dark:bg-dark-background-light",
        border:
            "border-light-color dark:border-dark-color border border-opacity-30 dark:border-opacity-20",
    },
    B: {
        text: "text-light-color dark:text-dark-color",
        bg: "bg-light-background-normal dark:bg-dark-background-light",
        border:
            "border-light-color dark:border-dark-color border border-opacity-30 dark:border-opacity-20",
    },
    C: {
        text: "text-light-color dark:text-dark-color",
        bg: "bg-light-background-normal dark:bg-dark-background-light",
        border:
            "border-light-color dark:border-dark-color border border-opacity-30 dark:border-opacity-20 border-dashed",
    },
};

const gradeMap: { [key: number]: string } = {
    0: "C",
    1: "B",
    2: "B+",
    3: "A",
    4: "A+",
    5: "O",
};

// Memoized component to prevent unnecessary re-renders
const GradeCard = memo(function GradeCard({
    mark,
    currentGrade,
    updateGrade,
    excludedCourses,
    courses,
}: {
    mark: Mark;
    currentGrade: string;
    updateGrade: (courseCode: string, grade: string, exclude?: boolean) => void;
    excludedCourses: string[];
    courses: Course[]
}) {
    const [editMode, setEditMode] = useState(false);
    const [expectedInternal, setExpectedInternal] = useState(60 - Number(mark.overall.total));
    const [requiredMarks, setRequiredMarks] = useState("0");

       
    // Find course details once using useMemo to prevent recalculation on each render
    const courseDetails = useMemo(() =>
        courses?.find((a) => a.code === mark.courseCode),
        [courses, mark.courseCode]
    );

    // Calculate required marks whenever relevant data changes
    useEffect(() => {
        if (!mark || !currentGrade) return;
        
        const total_internal_score = Number(mark.overall.scored) + expectedInternal;
        const isPractical = mark.courseType === "Practical";
        const maxExternalMarks = isPractical ? 40 : 75;

        const calculatedRequiredMarks = (
            ((grade_points[currentGrade] - total_internal_score) / 40) * 
            maxExternalMarks // Use the correctly determined max marks here
        );

        setRequiredMarks(calculatedRequiredMarks.toFixed(2));

       
    }, [currentGrade, expectedInternal, mark, updateGrade]);

    useEffect(() => {
        if (!mark) return;
        const total = Number(mark.overall.total);
        const scored = Number(mark.overall.scored);
        const lostMark = total - scored;

        const calculatedGrade =
            total == 100
                ? getGrade(Number(mark.overall.scored))
                : determineGrade(lostMark, total);
                
        updateGrade(mark.courseCode, calculatedGrade);
    }, [mark, updateGrade]);

    // Get slider value based on current grade
    const getSliderValue = (grade: string) => {
        const entry = Object.entries(gradeMap).find(([_, g]) => g === grade);
        return entry ? entry[0] : "5";
    };

    // Handle slider change with vibration feedback
    const handleSliderChange = (value: number[]) => {
        if (navigator.vibrate && typeof navigator.vibrate === 'function') {
            navigator.vibrate(40);
        }

        const newGrade = gradeMap[value[0]];
        updateGrade(mark.courseCode, newGrade);
    };

    // Toggle course exclusion
    const handleExcludeToggle = () => {
        updateGrade(mark.courseCode, currentGrade, true);
    };

    const isExcluded = excludedCourses.includes(mark.courseCode);

    return (
        <div
            className={`${isExcluded ? "opacity-30" : "opacity-100"} flex min-h-40 flex-col justify-between gap-8 rounded-2xl transition-all duration-100 ${Number(mark.overall.total) <= 60
                ? "bg-light-background-normal dark:bg-dark-background-normal"
                : `bg-opacity-80 dark:bg-opacity-40 bg-light-background-normal dark:bg-dark-background-normal`
                } p-4 px-5 text-light-color dark:text-dark-color`}
        >
            <div className="grid grid-cols-[1fr_0.2fr] items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold capitalize">
                        {!mark.courseName.toLowerCase().includes("n/a")
                            ? mark.courseName?.toLowerCase()
                            : courseDetails?.title || mark.courseCode}
                    </h2>
                    <p className="text-sm font-medium text-light-accent opacity-80 dark:text-dark-accent">
                        Credit:{" "}
                        <span className="text-sm text-light-info-color dark:text-dark-info-color">
                            {courseDetails?.credit || 0}
                        </span>
                    </p>
                </div>

                <div className="flex flex-col items-end justify-end gap-2">
                    <MarkDisplay marks={mark.overall} />
                    <button
                        onClick={handleExcludeToggle}
                        className="flex w-fit transform items-center justify-center gap-2 rounded-xl py-1 text-xs font-medium text-light-color transition-all duration-300 dark:text-dark-color"
                    >
                        <div
                            className={`h-1 w-2 rounded-full border-2 ring-1 transition duration-150 ${!isExcluded ? "border-light-side bg-light-accent ring-light-accent dark:border-dark-side dark:bg-dark-accent dark:ring-dark-accent" : "border-dark-accent ring-transparent"} p-1`}
                        />{" "}
                        Included
                    </button>
                </div>
            </div>

            <div className="relative flex flex-col-reverse gap-4">
                {Number(mark.overall.scored) <= 60 ? (
                    <>
                        {60 - Number(mark.overall.total) > 0 && (
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium opacity-80">
                                    Expected remaining from {60 - Number(mark.overall.total)}:
                                </p>
                                <input
                                    type="number"
                                    className="w-16 appearance-none rounded-md border-none bg-light-background-darker px-2 py-1 text-center outline-none dark:bg-dark-background-dark"
                                    value={expectedInternal}
                                    maxLength={3}
                                    max={60 - Number(mark.overall.total)}
                                    onChange={(e) => {
                                        const value = Number(e.target.value);
                                        if (
                                            value >= 0 &&
                                            value <= 60 - Number(mark.overall.total)
                                        ) {
                                            setExpectedInternal(value);
                                        }
                                    }}
                                />
                            </div>
                        )}

                        <div className="flex flex-row items-center justify-between gap-2 border-t-2 border-dashed border-black/10 pt-3 dark:border-white/10">
                            <h2 className="text-sm font-medium opacity-80">
                                Goal for sem exam
                            </h2>
                            <div className="flex items-center gap-1 rounded-full bg-light-background-dark dark:bg-dark-background-dark">
                                <span
                                    className={`pl-2 text-sm font-medium ${
                                        // For display purposes, we use the already formatted requiredMarks state
                                        Number(requiredMarks) <= 0
                                            ? "text-light-accent dark:text-dark-accent"
                                            : Number(requiredMarks) > (mark.courseType === "Practical" ? 40 : 75)
                                                ? "text-light-error-color dark:text-dark-error-color"
                                                : "text-light-success-color dark:text-dark-success-color"
                                        }`}
                                >
                                    {requiredMarks}
                                </span>
                                <span className="ml-1 rounded-full bg-light-success-color px-2 py-0.5 pr-2 text-sm font-bold text-light-success-background dark:bg-dark-success-color dark:text-dark-success-background">
                                    {mark.courseType === "Practical" ? 40 : 75}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-light-accent dark:text-dark-accent">
                            {["C", "B", "B+", "A", "A+", "O"].map((grade) => (
                                <span
                                    key={grade}
                                    className={`${currentGrade === grade ? "font-semibold" : "opacity-40"
                                        }`}
                                >
                                    {grade}
                                </span>
                            ))}
                        </div>
                        <Slider
                            max={5}
                            step={1}
                            value={[parseInt(getSliderValue(currentGrade))]}
                            onValueChange={handleSliderChange}
                            className="w-full"
                        />
                    </>
                ) : (
                    <>
                        <Medal
                            edit={editMode}
                            setEdit={setEditMode}
                            grade={
                                (Number(mark.overall.total) == 100
                                    ? getGrade(Number(mark.overall.scored))
                                    : determineGrade(
                                        Number(mark.overall.scored),
                                        Number(mark.overall.total),
                                    )) as "O" | "A+" | "A" | "B+" | "B" | "C"
                            }
                        />

                        {editMode && (
                            <>
                                <div className="flex items-center justify-between text-xs text-light-accent dark:text-dark-accent">
                                    {["C", "B", "B+", "A", "A+", "O"].map((grade) => (
                                        <span
                                            key={grade}
                                            className={`${currentGrade === grade ? "font-semibold" : "opacity-40"
                                                }`}
                                        >
                                            {grade}
                                        </span>
                                    ))}
                                </div>
                                <Slider
                                    max={5}
                                    step={1}
                                    value={[parseInt(getSliderValue(currentGrade))]}
                                    onValueChange={handleSliderChange}
                                    className="w-full"
                                />
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
});

export default GradeCard;
