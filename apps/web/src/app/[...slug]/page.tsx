import { ComingSoon } from "@/components/ComingSoon";
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <ComingSoon route={"/" + slug.join("/")} />;
}
