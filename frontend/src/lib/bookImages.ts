import bookCloud from "@/assets/book-cloud.jpg";
import bookRobo from "@/assets/book-robo.jpg";
import bookStars from "@/assets/book-stars.jpg";
import bookBug from "@/assets/book-bug.jpg";
import bookDino from "@/assets/book-dino.jpg";
import bookMoon from "@/assets/book-moon.jpg";
import sectionExplore from "@/assets/section-explore.jpg";
import sectionFriends from "@/assets/section-friends.jpg";
import sectionCelebrate from "@/assets/section-celebrate.jpg";

const map: Record<string, string> = {
  "book-cloud": bookCloud,
  "book-robo": bookRobo,
  "book-stars": bookStars,
  "book-bug": bookBug,
  "book-dino": bookDino,
  "book-moon": bookMoon,
  "section-explore": sectionExplore,
  "section-friends": sectionFriends,
  "section-celebrate": sectionCelebrate,
};

export const resolveImage = (slug: string): string => map[slug] ?? slug;

export const accentClass: Record<string, string> = {
  pink: "bg-brainy-pink",
  yellow: "bg-brainy-yellow",
  sky: "bg-brainy-sky",
  lime: "bg-brainy-lime",
  coral: "bg-brainy-coral",
  purple: "bg-brainy-purple",
};
