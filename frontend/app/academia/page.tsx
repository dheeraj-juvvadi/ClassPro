import ClientAcademia from "./ClientAcademia";
import { fetchUserData } from "@/hooks/fetchUserData";
import { fetchCalendar } from "@/hooks/fetchCalendar";
import NavBar from "./components/NavBar";

export default async function Academia() {
	const json = await fetchUserData();
	const cal = await fetchCalendar();

	return (
		<>
			<ClientAcademia json={json} cal={cal} />
			<NavBar />
		</>
	);
}
