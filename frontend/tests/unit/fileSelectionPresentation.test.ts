import { describe, expect, it, vi } from "vitest";
import { getFileChosenText } from "@/lib/app/fileSelectionPresentation";

describe("fileSelectionPresentation", () => {
  it("passes file and folder counts to the translation formatter", () => {
    const fileChosenLabel = vi
      .fn()
      .mockImplementation(
        ({ fileNum, folderNum }: { fileNum: number; folderNum: number }) =>
          `${fileNum} files / ${folderNum} folders`
      );

    expect(
      getFileChosenText({
        fileNum: 3,
        folderNum: 2,
        fileChosenLabel,
      })
    ).toBe("3 files / 2 folders");

    expect(fileChosenLabel).toHaveBeenCalledWith({
      fileNum: 3,
      folderNum: 2,
    });
  });
});
