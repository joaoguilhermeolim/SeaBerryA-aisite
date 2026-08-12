import { purgeExpiredEntries } from "./_shared/recruitment.mjs";

export default async function handler() {
  try {
    const result = await purgeExpiredEntries();
    console.log(
      `Recruitment retention completed: ${result.applications} applications and ${result.audit} audit events removed.`,
    );
  } catch (error) {
    console.error(
      "Recruitment retention failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    throw error;
  }
}

export const config = {
  schedule: "@daily",
};
