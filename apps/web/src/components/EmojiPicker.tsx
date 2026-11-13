export default function EmojiPicker({ emojis, value, onChange }: { emojis: string[]; value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-picker" role="radiogroup" aria-label="Emoji">
      {emojis.map((em) => (
        <button type="button" key={em} role="radio" aria-checked={em === value}
          className={`emoji-opt ${em === value ? "selected" : ""}`} onClick={() => onChange(em)}>{em}</button>
      ))}
    </div>
  );
}
