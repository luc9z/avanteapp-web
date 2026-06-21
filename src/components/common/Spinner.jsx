export default function Spinner({ size = 20, color = 'currentColor' }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin"
      style={{ width: size, height: size, color }}
      role="status"
      aria-label="carregando"
    />
  )
}
