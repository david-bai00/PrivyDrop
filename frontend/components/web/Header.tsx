"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Menu, X, Github } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Messages } from "@/types/messages";

/**
 * Props interface for the Header component
 */
interface HeaderProps {
  messages: Messages;
  lang: string;
}

/**
 * Header component providing navigation, language switching, and GitHub link
 * Features responsive design with mobile menu support
 */
const Header = ({ messages, lang }: HeaderProps) => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Configuration for navigation items
  const navItems = [
    { href: `/${lang}`, label: messages.text.Header.Home_dis },
    { href: `/${lang}/features`, label: messages.text.Header.Features_dis },
    { href: `/${lang}/blog`, label: messages.text.Header.Blog_dis },
    { href: `/${lang}/about`, label: messages.text.Header.About_dis },
    { href: `/${lang}/help`, label: messages.text.Header.Help_dis },
    { href: `/${lang}/faq`, label: messages.text.Header.FAQ_dis },
    { href: `/${lang}/terms`, label: messages.text.Header.Terms_dis },
    { href: `/${lang}/privacy`, label: messages.text.Header.Privacy_dis },
  ];

  // GitHub repository URL
  const githubUrl = "https://github.com/david-bai00/PrivyDrop";

  return (
    <header className="bg-background border-b sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo and site name */}
          <Link href={`/${lang}`} className="flex items-center space-x-2">
            <Image
              src="/logo.png"
              alt="PrivyDrop Logo"
              width={40}
              height={40}
              priority
            />
            <span className="font-bold text-xl hidden sm:inline">
              PrivyDrop
            </span>
          </Link>

          {/* Desktop navigation and controls */}
          <div className="hidden md:flex items-center space-x-4">
            <nav>
              <ul className="flex space-x-2">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "hover:bg-muted",
                        pathname === item.href && "bg-muted"
                      )}
                    >
                      <Link href={item.href}>{item.label}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </nav>
            {/* Desktop GitHub link and language switcher */}
            <div className="flex items-center space-x-2">
              <Button asChild variant="ghost" size="icon">
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub Repository"
                >
                  <Github className="h-5 w-5" />
                </Link>
              </Button>
              <LanguageSwitcher />
            </div>
          </div>

          {/* Mobile menu controls */}
          <div className="md:hidden flex items-center space-x-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="icon">
              <Link
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub Repository"
              >
                <Github className="h-5 w-5" />
              </Link>
            </Button>
            <button
              className="p-2"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile navigation menu */}
        {isOpen && (
          <nav className="md:hidden mt-4">
            <ul className="flex flex-col space-y-2">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Button
                    asChild
                    variant="ghost"
                    className={cn(
                      "w-full justify-start",
                      pathname === item.href && "bg-muted"
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <Link href={item.href}>{item.label}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;
