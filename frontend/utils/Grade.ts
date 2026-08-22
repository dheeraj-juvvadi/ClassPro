// Moved outside the component to prevent recreation on each render
export const gradePoints: { [key: string]: number } = {
    O: 10,
    "A+": 9,
    A: 8,
    "B+": 7,
    B: 6,
    C: 5,
};

// Exported for use in GradeCard to avoid duplication
export function determineGrade(scoredMarks: number, totalMarks: number): string {
    // Prevent NaN on initial render
    if (!totalMarks) return "O";
    
    const percentage = (scoredMarks / totalMarks) * 100;

    if (percentage >= 91) return "O";
    if (percentage >= 81) return "A+";
    if (percentage >= 71) return "A";
    if (percentage >= 61) return "B+";
    if (percentage >= 56) return "B";
    if (percentage >= 50) return "C";
    return "F";
}
