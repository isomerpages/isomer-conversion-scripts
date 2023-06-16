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
  setOfAllDocumentsPath: Set<string>;
  currentRepoName: string;
}) {
  let fileContent = await fs.promises.readFile(filePath, "utf-8");
  let fileChanged = false;

  ({ fileContent, fileChanged } = await changeFileContent({
    fileContent,
    changedPermalinks,
    setOfAllDocumentsPath,
    currentRepoName,
  }));

  if (fileChanged) {
    await fs.promises.writeFile(filePath, fileContent, "utf-8");
    await simpleGit(repoPath).add(filePath);
  }
}
