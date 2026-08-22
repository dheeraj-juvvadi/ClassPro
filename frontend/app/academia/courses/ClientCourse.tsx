'use client'
import Loading from '@/components/States/Loading'
import React, { Suspense } from 'react'
import CourseCard from './components/Card'

import Indicator from '@/components/Indicator'
import { AllResponse } from '@/types/Response'

export default function ClientCourse({ json }: {
    json: AllResponse
}) {
    
  return (
    <Suspense fallback={<Loading size="xl" />}>
					<div className="flex flex-col items-center gap-2 justify-center">
						{json.courses?.courses
							.filter((a) => a.slotType === "Theory")
							.map((course, i) => (
								<CourseCard key={i} course={course} />
							))}
					</div>
					<Indicator type="Practical" separator />
					<div className="flex flex-col items-center gap-2 justify-center">
						{json.courses?.courses
							.filter((a) => a.slotType === "Practical")
							.map((course, i) => (
								<CourseCard key={i} course={course} />
							))}
					</div>
				</Suspense>
  )
}
