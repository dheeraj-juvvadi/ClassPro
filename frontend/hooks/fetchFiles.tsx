"use server";
import { cache } from "react";
import { files } from "@/library/files";


async function fetchFiles() {
    return files;
}

export const fetchFileArray = cache(async () => {
    return await fetchFiles();
});
