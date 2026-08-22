'use client'
import Indicator from '@/components/Indicator';
import { Course } from '@/types/Course';
import { getGrade } from '@/types/Grade';
import type { Mark } from '@/types/Marks';
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import GradeCard from './GradeCard';
import { determineGrade, gradePoints } from '@/utils/Grade';

export default function GradeCalculator({ marks, courses }: { marks: Mark[], courses: Course[] }) {
    const [grades, setGrades] = useState<{ [courseCode: string]: string }>({});
    const [sgpa, setSgpa] = useState(0);
    const [excludedCourses, setExcludedCourses] = useState<string[]>([]);

    // Use useMemo to filter theory and practical courses only when dependencies change
    const theory = useMemo(() => 
        marks
            ?.filter((a) => a.courseType === "Theory")
            .filter((a) =>
                courses
                    ? (Number(courses.find((c) => c.code === a.courseCode)?.credit) ?? 0) > 0
                    : false,
            ) || [],
    [marks, courses]);

    const practicals = useMemo(() => 
        marks
            ?.filter((a) => a.courseType === "Practical")
            .filter((a) =>
                courses
                    ? (Number(courses.find((c) => c.code === a.courseCode)?.credit) ?? 0) > 0
                    : false,
            )
            .filter(
                (practical) =>
                    !theory.some(
                        (theory) =>
                            theory.courseType === "Theory" &&
                            theory.courseCode === practical.courseCode,
                    ),
            ) || [],
    [marks, courses, theory]);

    // Initialize grades on first render
    useEffect(() => {
        if (!marks?.length) return;
        
        const initialGrades: { [courseCode: string]: string } = {};
        
        marks.forEach((mark) => {
            const total = Number(mark.overall.total);
            const scored = Number(mark.overall.scored);
            let initialGradeValue: string;

            if (total < 60) {
                const maxRemainingInternal = 60 - total;
                const maxExternal = 40;
                const maxPotentialScore = scored + maxRemainingInternal + maxExternal;
                initialGradeValue = getGrade(Math.min(maxPotentialScore, 100));
            } else {
                initialGradeValue = total === 100
                    ? getGrade(scored)
                    : determineGrade(scored, total);
            }

            initialGrades[mark.courseCode] = initialGradeValue;
        });
        
        setGrades(initialGrades);
    }, [marks]);

    // Use useCallback to prevent recreation of this function on every render
    const updateGrade = useCallback((
        courseCode: string,
        grade: string,
        exclude: boolean = false,
    ) => {
        setGrades((prevGrades) => ({
            ...prevGrades,
            [courseCode]: grade,
        }));

        if (exclude) {
            setExcludedCourses((prevExcluded) => {
                if (prevExcluded.includes(courseCode)) {
                    return prevExcluded.filter((code) => code !== courseCode);
                } else {
                    return [...prevExcluded, courseCode];
                }
            });
        }
    }, []);

    // Calculate SGPA when relevant data changes
    useEffect(() => {
        if (!courses || !Object.keys(grades).length) return;

        let totalPoints = 0;
        let totalCredits = 0;

        Object.entries(grades).forEach(([courseCode, grade]) => {
            if (excludedCourses.includes(courseCode)) return;

            const course = courses.find((c) => c.code === courseCode);
            if (course) {
                const credits = Number(course.credit);
                const gradePoint = gradePoints[grade] || 0;

                totalPoints += credits * gradePoint;
                totalCredits += credits;
            }
        });

        const calculatedSgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
        setSgpa(parseFloat(calculatedSgpa.toFixed(2)));
    }, [grades, courses, excludedCourses]);

    return (
        <main className="h-screen w-full pb-0">
            <div className="flex flex-col gap-12">
                <section id="links" className="flex flex-col gap-6">
                    <h1 className="text-3xl font-semibold text-light-color dark:text-dark-color">
                        GradeX
                    </h1>

                    <div className="flex flex-col gap-6 rounded-3xl border-opacity-10 lg:border lg:p-2 dark:border-white/10">
                        {marks?.length ? (
                            <>
                                <div className="hidden w-full items-center justify-center lg:flex">
                                    <h2
                                        className={`rounded-2xl border px-8 py-4 text-center text-5xl font-semibold ${sgpa > 8.5 ? "border-transparent bg-light-success-background text-light-success-color dark:bg-dark-success-background dark:text-dark-success-color" : sgpa < 6 ? "border-dashed border-light-error-color bg-light-error-background text-light-error-color dark:border-dark-error-color dark:bg-dark-error-background dark:text-dark-error-color" : "border border-light-input bg-light-background-light text-light-color dark:border-dark-input dark:bg-dark-background-darker dark:text-dark-color"}`}
                                    >
                                        {sgpa} <span className="text-base opacity-40">SGPA</span>
                                    </h2>
                                </div>
                                <div className="grid animate-fadeIn grid-cols-1 gap-2 transition-all duration-200 lg:grid-cols-2 xl:grid-cols-3">
                                    {theory.map((mark, index) => (
                                        <GradeCard
                                            courses={courses}
                                            mark={mark}
                                            excludedCourses={excludedCourses}
                                            key={`${mark.courseCode}-${index}`}
                                            currentGrade={grades[mark.courseCode] || "O"}
                                            updateGrade={updateGrade}
                                        />
                                    ))}
                                </div>

                                {practicals?.length > 0 && (
                                    <>
                                        <Indicator type="Practical" separator />
                                        <div className="grid animate-fadeIn grid-cols-1 gap-2 transition-all duration-200 lg:grid-cols-2 xl:grid-cols-3">
                                            {practicals.map((mark, index) => (
                                                <GradeCard
                                                    mark={mark}
                                                    courses={courses}
                                                    key={`${mark.courseCode}-${index}`}
                                                    excludedCourses={excludedCourses}
                                                    currentGrade={grades[mark.courseCode] || "O"}
                                                    updateGrade={updateGrade}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                                <div className="sticky bottom-4 flex items-center justify-center lg:hidden">
                                    <h2
                                        className={`rounded-full px-6 py-3 text-center text-3xl font-semibold shadow-xl dark:shadow-xl ${sgpa > 8.5 ? "bg-light-success-background text-light-success-color dark:bg-dark-success-background dark:text-dark-success-color" : sgpa < 6 ? "border border-dashed border-light-error-color bg-light-error-background text-light-error-color dark:border-dark-error-color dark:bg-dark-error-background dark:text-dark-error-color" : "border border-light-input bg-light-background-light text-light-color dark:border-dark-input dark:bg-dark-background-darker dark:text-dark-color"}`}
                                    >
                                        {sgpa} <span className="text-sm opacity-40">SGPA</span>
                                    </h2>
                                </div>
                            </>
                        ) : (
                            <></>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}