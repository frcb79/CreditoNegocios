/**
 * Lightweight renderer for the educational financing guides. No HTML is
 * injected and no additional client-side dependencies are necessary.
 */
function emphasize(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
}

export function ProductGuideContent({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm sm:text-base text-foreground leading-relaxed" data-testid="product-guide-content">
      {content.split("\n").filter(line => line.trim()).map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-base sm:text-lg mt-5">{emphasize(line.slice(4))}</h3>;
        if (line.startsWith("- ")) {
          return <p key={i} className="pl-5 relative before:content-['•'] before:absolute before:left-1 before:text-primary">{emphasize(line.slice(2))}</p>;
        }
        const ordered = line.match(/^(\d+)\.\s+(.*)$/);
        if (ordered) return <p key={i} className="pl-6 relative"><span className="absolute left-0 font-bold text-primary">{ordered[1]}.</span>{emphasize(ordered[2])}</p>;
        return <p key={i}>{emphasize(line)}</p>;
      })}
    </div>
  );
}
