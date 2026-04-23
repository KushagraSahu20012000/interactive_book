import { NavLink } from "@/components/NavLink";
import { Brain } from "lucide-react";

export const TopNav = () => {
  return (
    <nav className="sticky top-0 z-50 bg-brainy-yellow border-b-[4px] border-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <NavLink
          to="/"
          className="flex items-center gap-2 group"
          activeClassName=""
        >
          <div className="bg-brainy-pink brutal-border brutal-shadow-sm p-2 group-hover:animate-wiggle">
            <Brain className="w-6 h-6 text-foreground" strokeWidth={3} />
          </div>
          <span className="font-display text-2xl sm:text-3xl uppercase">Bright Minds</span>
        </NavLink>

        <div className="flex items-center gap-2 sm:gap-3">
          <NavLink
            to="/"
            end
            className="font-display uppercase px-3 sm:px-4 py-2 bg-brainy-sky brutal-border brutal-shadow-sm brutal-press text-sm sm:text-base"
            activeClassName="!bg-brainy-pink text-primary-foreground"
          >
            Home
          </NavLink>
          <NavLink
            to="/books"
            className="font-display uppercase px-3 sm:px-4 py-2 bg-brainy-lime brutal-border brutal-shadow-sm brutal-press text-sm sm:text-base"
            activeClassName="!bg-brainy-pink text-primary-foreground"
          >
            Books
          </NavLink>
          <div className="hidden sm:flex items-center gap-1 px-3 py-2 bg-card brutal-border brutal-shadow-sm font-display text-sm">
            <span>●</span>
            <span>AI Live</span>
          </div>
        </div>
      </div>
    </nav>
  );
};
