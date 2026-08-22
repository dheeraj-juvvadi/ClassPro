import type { AttendanceCourse } from "@/types/Attendance";
import React, { Suspense } from "react";
import AttendanceCard from "./Card";
import Indicator from "@/components/Indicator";

export default function List({
	list,
	continuous,
}: { list: AttendanceCourse[]; continuous?: boolean }) {
	return (
		<Suspense>
			<div
				className={
					list?.filter((a) => a.category === "Practical")[0] ? "mb-4" : ""
				}
			>
				{list
					?.filter((a) => a.category === "Theory")
					.map((course, index) => (
						<AttendanceCard
								continuous={continuous}
								key={index}
								attendance={course}
								delay={index * 0.05}
							/>
						))}
						</div>

						{list?.filter((a) => a.category === "Practical")?.[0] && (
						<Indicator type="Practical" separator />
						)}

						{list?.filter((a) => a.category === "Practical")[0] && (
						<div className="mt-4">
						{list
							?.filter((a) => a.category === "Practical")
							.map((course, index) => (
								<AttendanceCard
									continuous={continuous}
									key={index}
									attendance={course}
									delay={index * 0.05}
							/>
						))}
						</div>
			)}
		</Suspense>
	);
}
