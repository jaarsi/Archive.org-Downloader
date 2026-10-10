import DownloadForm from "./DownloadForm";

export const dynamic = "force-dynamic"; // read env at request time, not build

export default function Home() {
  const hasDefault = Boolean(process.env.ARCHIVE_EMAIL && process.env.ARCHIVE_PASSWORD);
  return <DownloadForm hasDefault={hasDefault} />;
}
