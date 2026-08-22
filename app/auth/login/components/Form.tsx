"use client";
import React, { useCallback, useState } from "react";
import UidInput from "./form/UidInput";
import PasswordInput from "./form/PasswordInput";
import rotateUrl from "@/utils/URL";
import Button from "@/components/Button";
import { token } from "@/utils/Tokenize";
import { useTransitionRouter } from "next-view-transitions";
import Link from "next/link";
import { setCookie } from "@/utils/Cookies";

export default function Form() {
	const router = useTransitionRouter();
	const [uid, setUid] = useState("");
	const [pass, setPass] = useState("");

	const [status, setStatus] = useState<number>(0);
	const [statusMessage, setMessage] = useState("");

	const handleLogin = useCallback(async (account: string, password: string) => {
		const registrationId = account.replaceAll(" ", "").replace("@srmist.edu.in", "");
		setStatus(1);
		setMessage("");

		let login: Response;
		try {
			login = await fetch(`${rotateUrl()}/login`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token()}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					account: registrationId,
					password,
				}),
			});
		} catch {
			setStatus(-1);
			setMessage("Unable to reach ClassPro services. Check your connection.");
			return;
		}

		let loginResponse: {
			authenticated?: boolean;
			cookies?: string;
			message?: string;
		};
		try {
			loginResponse = await login.json();
		} catch {
			setStatus(-1);
			setMessage("The authentication service returned an invalid response.");
			return;
		}

		if (!login.ok) {
			setStatus(-1);
			setMessage(
				loginResponse?.message ||
					(login.status >= 500
						? "Authentication service is unavailable."
						: "Login failed. Check your details and try again."),
			);
			return;
		}

		if (loginResponse.authenticated) {
			setStatus(2);
			setMessage("Loading data...");
			if(!loginResponse.cookies) {
				setStatus(-1);
				setMessage("No cookies received. Wrong password.");
				return;
			}
			setCookie("key", loginResponse.cookies);
			
			router.push("/academia");
		} else if (loginResponse?.message) {
			setStatus(-1);
			if (loginResponse.message?.includes("Digest"))
				setMessage(
					"Seems like this is your first time. Go to academia.srmist.edu.in and setup password!",
				);
			else setMessage(loginResponse?.message);
		}
	}, []);

	return (
		<form
			className="flex flex-col gap-6"
			onSubmit={(event) => {
				event.preventDefault();
				if (!uid || !pass || status === 1 || status === 2) return;
				void handleLogin(uid, pass);
			}}
			noValidate
		>
			{status === -1 && (
				<p className="rounded-2xl bg-light-error-background px-4 py-2 text-light-error-color dark:bg-dark-error-background dark:text-dark-error-color">
					{statusMessage?.includes(">_") ? "" : "SRM:"}
					{statusMessage?.replace(">_", "")}
				</p>
			)}

			{status === 2 && statusMessage && (
				<p className="rounded-2xl bg-light-success-background px-4 py-2 text-light-success-color dark:bg-dark-success-background dark:text-dark-success-color">
					{statusMessage}
				</p>
			)}
			<div className="relative flex flex-col gap-1">
				<UidInput uid={uid} setUid={setUid} />
				<PasswordInput password={pass} setPassword={setPass} />
			</div>

			<div className="flex flex-row gap-2">
				<Button
					disabled={!uid || !pass || status === 1 || status === 2}
					className={`w-full md:w-fit ${
						status === 2
							? "border border-light-success-color bg-light-success-background text-light-success-color dark:border-dark-success-color dark:bg-dark-success-background dark:text-dark-success-color"
							: status === 1
								? "border border-light-warn-color bg-light-warn-background text-light-warn-color dark:border-dark-warn-color dark:bg-dark-warn-background dark:text-dark-warn-color"
								: status === -1
									? "border border-light-error-color bg-light-error-background text-light-error-color dark:border-dark-error-color dark:bg-dark-error-background dark:text-dark-error-color"
									: ""
					}`}
					type="submit"
				>
					{status === 1 ? "Authenticating" : status === 2 ? "Success" : "Login"}
				</Button>
				<Link
					href="https://academia.srmist.edu.in/reset"
					className="border-2 opacity-50 text-light-color dark:text-dark-color border-light-color dark:border-dark-color px-4 py-2 rounded-full text-sm font-medium"
				>
					Forgot
				</Link>
			</div>
		</form>
	);
}
