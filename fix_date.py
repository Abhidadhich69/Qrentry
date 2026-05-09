with open('src/App.tsx', 'r') as f:
    content = f.read()

helper = """// Helper to parse SQLite UTC timestamps correctly
const parseDate = (ts: string) => {
  if (!ts) return new Date();
  if (ts.includes('T')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
};

export default function App() {"""

content = content.replace("export default function App() {", helper)
content = content.replace("new Date(data.entry.timestamp)", "parseDate(data.entry.timestamp)")
content = content.replace("new Date(entry.timestamp)", "parseDate(entry.timestamp)")
content = content.replace("new Date(a.timestamp)", "parseDate(a.timestamp)")
content = content.replace("new Date(b.timestamp)", "parseDate(b.timestamp)")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Dates fixed.")
