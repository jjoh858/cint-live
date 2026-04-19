import Layout from "../components/layout";

const problems = [
  { id: "1", title: "Two Sum" },
  { id: "2", title: "Binary Search" },
];

export default function ProblemPage() {
  return (
    <Layout problems={problems}>
      <h1>Problem List Page</h1>
    </Layout>
  );
}