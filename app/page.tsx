import { redirect } from "next/navigation";

// The workspace is the product; land there rather than on a sign-in wall.
export default function Home() {
  redirect("/dashboard");
}
