import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPostDate, getPublishedPost, getPublishedPosts, renderMarkdown, type BlogPostSummary } from "../../../../lib/blog";
import styles from "../blog.module.css";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug).catch(() => null);
  return post
    ? { title: post.title, description: post.excerpt ?? undefined, alternates: { canonical: `/blog/${post.slug}` } }
    : { title: "Article not found" };
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function Cover({ post, className }: { post: BlogPostSummary; className: string }) {
  if (post.cover_image_url) return <img className={className} src={post.cover_image_url} alt="" />;
  return <div className={`${className} ${styles.coverFallback}`} aria-hidden="true"><span>{post.category ?? "FreeReader"}</span></div>;
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug).catch(() => null);
  if (!post) notFound();

  const related = await getPublishedPosts()
    .then((posts) => posts.filter((item) => item.slug !== post.slug).slice(0, 3))
    .catch(() => []);

  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <div className="wrap">
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/blog">Blog</Link>
            {post.category && <><span aria-hidden="true">/</span><span>{post.category}</span></>}
          </nav>

          <header className={styles.articleHeader}>
            {post.category && <span className={styles.category}>{post.category}</span>}
            <h1>{post.title}</h1>
            {post.excerpt && <p className={styles.articleLead}>{post.excerpt}</p>}
            <div className={styles.articleMeta}>
              <span>By {post.author_name}</span>
              <span className={styles.dot} />
              <span>{formatPostDate(post.published_at)}</span>
              {post.read_time_minutes && <><span className={styles.dot} /><span>{post.read_time_minutes} min read</span></>}
            </div>
          </header>

          <Cover post={post} className={styles.articleCover} />

          <div className={styles.prose} dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />

          <div className={styles.articleFooter}>
            <Link className={`text-link ${styles.backLink}`} href="/blog"><ArrowIcon /> Back to all articles</Link>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <section className={`wrap ${styles.related}`} aria-labelledby="related-heading">
          <h2 id="related-heading" className={styles.sectionHeading}>Keep reading</h2>
          <div className={styles.grid}>
            {related.map((item) => (
              <Link className={styles.card} href={`/blog/${item.slug}`} key={item.id}>
                <Cover post={item} className={styles.cardCover} />
                <div className={styles.cardBody}>
                  {item.category && <span className={styles.category}>{item.category}</span>}
                  <h3>{item.title}</h3>
                  <p>{item.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.cta}>
        <div className="wrap">
          <h2>Listen to this article.</h2>
          <p>Paste any link or upload a document, then hear it read aloud in a natural voice.</p>
          <Link className="button" href="/reader">Open audiobook reader <ArrowIcon /></Link>
        </div>
      </section>
    </main>
  );
}
