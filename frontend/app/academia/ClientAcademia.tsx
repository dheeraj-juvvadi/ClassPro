'use client'
import Loading from '@/components/States/Loading';
import { CalendarResponse } from '@/types/Calendar';
import { AllResponse } from '@/types/Response';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import React, { Suspense } from 'react'

const Attendance = dynamic(() => import("./components/Attendance"), {
	ssr: false,
	loading: () => <Loading size="xl" />,
});

const Marks = dynamic(() => import("./components/Marks"), { 
	ssr: false,
	loading: () => <Loading size="xl" />,
});

const Timetable = dynamic(() => import("./components/Timetable"), {
	ssr: false,
	loading: () => <Loading size="xl" />,
});



export default function ClientAcademia({ json, cal }: { json: AllResponse, cal: CalendarResponse }) {
    const ophours = json?.ophour?.split(",") ?? [];
    return (
		<>
			<div id="items" className="flex flex-col min-h-screen gap-12 relative">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-50px" }}
					transition={{ duration: 0.4 }}
				>
					<Suspense fallback={<Loading size="xl" />}>
						<Timetable
							ophours={ophours ?? []}
							schedule={json.timetable?.schedule}
							cal={cal}
						/>
					</Suspense>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-50px" }}
					transition={{ duration: 0.4, delay: 0.1 }}
				>
					<Suspense fallback={<Loading size="xl" />}>
						<Attendance data={json} cal={cal} />
					</Suspense>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-50px" }}
					transition={{ duration: 0.4, delay: 0.2 }}
				>
					<Suspense fallback={<Loading size="xl" />}>
						<Marks marks={json.marks?.marks} courses={json.courses?.courses} />
					</Suspense>
				</motion.div>
			</div>
			
		</>
	);
}
