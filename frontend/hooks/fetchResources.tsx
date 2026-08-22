"use server";
import { cache } from "react";
import { resourcesFiles } from "@/library/resources";


async function fetchResources() {
    return resourcesFiles;
}

export const fetchResourcesArray = cache(async () => {
    return await fetchResources();
});
