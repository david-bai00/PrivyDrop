import { describe, expect, it } from "vitest";
import {
  isCustomFile,
  normalizeDisplayFiles,
} from "@/lib/app/fileListPresentation";

describe("fileListPresentation", () => {
  it("keeps receiver metadata rows intact even when lastModified is present", () => {
    const meta = {
      name: "phase4-single-file.txt",
      size: 100,
      fullName: "phase4-single-file.txt",
      folderName: "",
      fileType: "text/plain",
      fileId: "phase4-single-file.txt-100-text/plain-1776408316298",
      lastModified: 1776408316298,
    };

    expect(isCustomFile(meta as any)).toBe(false);
    expect(normalizeDisplayFiles([meta as any])).toEqual([meta]);
  });

  it("normalizes sender draft files into display metadata", () => {
    const file = Object.assign(
      new File(["hello"], "draft.txt", {
        type: "text/plain",
        lastModified: 42,
      }),
      {
        fullName: "draft.txt",
        folderName: "",
      }
    );

    const [normalized] = normalizeDisplayFiles([file as any]);
    expect(normalized.fileType).toBe("text/plain");
    expect(normalized.fileId).toBe("draft.txt-5-text/plain-42");
  });
});
