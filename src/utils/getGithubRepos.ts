import { Octokit } from "@octokit/rest";
import { ORGANIZATION_NAME } from "constants/githubConstants";
import fs from "fs/promises";

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;

async function fetchAllRepos(): Promise<string[]> {
  const octokit = new Octokit({
    auth: GITHUB_ACCESS_TOKEN,
  });

  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org: ORGANIZATION_NAME,
  });
  const repoNames = repos.map((repo) => repo.name);

  return repoNames;
}

async function writeReposToCsv(repos: string[]) {
  const csvData = "repo_name\n" + repos.join("\n");
  await fs.writeFile("repos.csv", csvData);
}

async function main() {
  try {
    const repos = await fetchAllRepos();
    await writeReposToCsv(repos);
    console.log("Repositories fetched successfully and saved to repos.csv");
  } catch (error) {
    console.error("Error fetching repositories:", error);
  }
}

main();
