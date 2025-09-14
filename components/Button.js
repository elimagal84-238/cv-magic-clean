export default function Button({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition ${className}`}
    >
      {children}
    </button>
  );
}
