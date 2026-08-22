import { fetchUserData } from "@/hooks/fetchUserData";
import React from "react";
import ClientCourse from "./ClientCourse";

export default async function Courses() {
	const json = await fetchUserData();

	return (
		<div className="flex flex-col gap-12">
			<section id="links" className="flex flex-col gap-4">
				<h1 className="text-2xl font-semibold">Courses</h1>
				<ClientCourse json={json} />
			</section>
		</div>
	);
}
