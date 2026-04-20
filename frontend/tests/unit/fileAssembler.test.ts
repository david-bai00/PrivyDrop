import { describe, expect, it } from "vitest";
import { FileAssembler } from "@/lib/receive/FileAssembler";
import { generateFileId } from "@/lib/fileUtils";
import type { fileMetadata } from "@/types/webrtc";

describe("FileAssembler", () => {
  it("reconstructs files with sender metadata so file ids stay stable", async () => {
    const assembler = new FileAssembler();
    const sourceText = "phase4 file payload";
    const lastModified = 1711111111111;
    const blob = new Blob([sourceText], { type: "text/plain" });
    const sourceFile = Object.assign(
      new File([blob], "phase4-single-file.txt", {
        type: "text/plain",
        lastModified,
      }),
      {
        fullName: "phase4-single-file.txt",
        folderName: "",
      }
    );

    const meta: fileMetadata = {
      type: "fileMeta",
      fileId: generateFileId(sourceFile),
      name: sourceFile.name,
      size: sourceFile.size,
      fileType: sourceFile.type,
      fullName: sourceFile.fullName,
      folderName: sourceFile.folderName,
      lastModified,
    };

    const result = await assembler.assembleFileFromChunks(
      [await sourceFile.arrayBuffer()],
      meta,
      null
    );

    expect(result.file.lastModified).toBe(lastModified);
    expect(generateFileId(result.file)).toBe(meta.fileId);
  });
});
