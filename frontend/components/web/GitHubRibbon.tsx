import { Github } from "lucide-react";
import Link from "next/link";

const GitHubRibbon = () => {
  // 定义基础尺寸，便于统一调整
  const squareSize = "170px"; // 正方形大小
  const triangleSize = "150px"; // 三角形大小
  const ribbonWidth = "280px"; // 彩带宽度
  const ribbonHeight = "34px"; // 彩带高度

  return (
    <div
      className="github-corner group"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        zIndex: 1000,
        width: squareSize,
        height: squareSize,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {/* 三角形背景 */}
      <div
        className="absolute top-0 right-0 bg-black dark:bg-gray-800"
        style={{
          width: triangleSize,
          height: triangleSize,
          clipPath: "polygon(100% 0, 100% 100%, 0 0)",
        }}
      />

      {/* GitHub 图标 */}
      <Github
        className="absolute text-primary-foreground rotate-45"
        style={{
          top: "28px",
          right: "28px",
        }}
        size={38}
      />

      {/* Fork me 彩带 */}
      <Link
        href="https://github.com/david-bai00/PrivyDrop"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bg-green-600 text-white font-bold flex items-center justify-center shadow-lg transform rotate-45 transition-colors duration-300 group-hover:bg-green-700"
        style={{
          top: "50px",
          right: "-64px",
          width: ribbonWidth,
          height: ribbonHeight,
          pointerEvents: "auto",
        }}
      >
        Fork me on GitHub
      </Link>
    </div>
  );
};

export default GitHubRibbon;
