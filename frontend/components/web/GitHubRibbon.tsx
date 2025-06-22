import { Github } from "lucide-react";
import Link from "next/link";

const GitHubRibbon = () => {
  // Define base dimensions for easy adjustment
  const squareSize = "170px"; // Square size
  const triangleSize = "150px"; // Triangle size
  const ribbonWidth = "280px"; // Ribbon width
  const ribbonHeight = "34px"; // Ribbon height

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
      {/* Triangle background */}
      <div
        className="absolute top-0 right-0 bg-black dark:bg-gray-800"
        style={{
          width: triangleSize,
          height: triangleSize,
          clipPath: "polygon(100% 0, 100% 100%, 0 0)",
        }}
      />

      {/* GitHub Icon */}
      <Github
        className="absolute text-primary-foreground rotate-45"
        style={{
          top: "28px",
          right: "28px",
        }}
        size={38}
      />

      {/* Fork me Ribbon */}
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
