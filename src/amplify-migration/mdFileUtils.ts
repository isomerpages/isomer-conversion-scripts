import simpleGit from "simple-git";
import fs from "fs";
import { changeFileContent } from "./amplifyMigrationScript";

export async function changePermalinksInMdFile({
  filePath,
  repoPath,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: {
  filePath: string;
  repoPath: string;
  changedPermalinks: { [key: string]: string };
  setOfAllDocumentsPath: Set<Lowercase<string>>;
  currentRepoName: string;
}) {
  let fileContent = await fs.promises.readFile(filePath, "utf-8");
  const originalFileContent = fileContent;

  ({ fileContent } = await changeFileContent({
    filePath,
    fileContent,
    changedPermalinks,
    setOfAllDocumentsPath,
    currentRepoName,
  }));

  if (originalFileContent !== fileContent) {
    await fs.promises.writeFile(filePath, fileContent, "utf-8");
    await simpleGit(repoPath).add(filePath);
  }
}
