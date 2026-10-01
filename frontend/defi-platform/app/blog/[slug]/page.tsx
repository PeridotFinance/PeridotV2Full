import Image from "next/image"
import Link from "next/link"
import Script from "next/script"
import type { Metadata, Viewport } from "next"
import { Calendar, Clock, Tag, User, ArrowLeft, Twitter, Linkedin, LinkIcon, ArrowRight, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import AskWithAI from "@/components/blog/AskWithAI"
import { Card, CardContent } from "@/components/ui/card"
import { fetchPostBySlugFromDB, markdownToHtml, getTableOfContents, fetchAllPostsFromDB } from "@/lib/blog-utils"
import PostPreview from "@/components/blog/post-preview"
import MobileTableOfContents from "@/components/blog/mobile-table-of-contents"
import { ArticleContent } from "@/components/blog/article-content"
import type { TableOfContentsItem } from "@/types/blog"
import "./blog-content.css"
import "../../not-found.css"

export const dynamic = "force-dynamic"

// Update Props type to specify Promise for params
type Props = {
  params: Promise<{ slug: string }>
}

// Move viewport properties to a separate viewport export
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // Properly handle params as a Promise
  const resolvedParams = await params
  const post = await fetchPostBySlugFromDB(resolvedParams.slug)

  if (!post) {
    return {
      title: "Post Not Found",
    }
  }

  const ogImage = post.coverImage && !post.coverImage.includes("placeholder")
    ? post.coverImage
    : "/misc/thumbnail-preview.webp"

  return {
    title: `${post.title} | Peridot Blog`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${resolvedParams.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author.name],
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      images: [ogImage],
    },
  }
}

// No static params; posts are fetched from the database at request time

export default async function BlogPost({ params }: Props) {
  // Properly handle params as a Promise
  const resolvedParams = await params
  const post = await fetchPostBySlugFromDB(resolvedParams.slug)

  if (!post) {
    // Show custom 404 with blog roll
    const allPosts = await fetchAllPostsFromDB()
    const recentPosts = allPosts.slice(0, 6) // Show 6 recent posts

    return (
      <div className="not-found-container">
        {/* Animated background gradient */}
        <div className="not-found-background">
          <div className="gradient-orb orb-1"></div>
          <div className="gradient-orb orb-2"></div>
          <div className="gradient-orb orb-3"></div>
        </div>

        {/* Subtle grid pattern */}
        <div className="grid-pattern"></div>

        <div className="not-found-content">
          {/* Animated 404 number */}
          <div className="error-code-wrapper">
            <h1 className="error-code">
              <span className="digit" style={{ animationDelay: '0s' }}>4</span>
              <span className="digit" style={{ animationDelay: '0.1s' }}>0</span>
              <span className="digit" style={{ animationDelay: '0.2s' }}>4</span>
            </h1>
            <div className="error-code-glow"></div>
          </div>

          {/* Animated message */}
          <div className="error-message-wrapper">
            <p className="error-message">
              The blog post you're looking for doesn't exist.
            </p>
            <div className="error-underline"></div>
          </div>

          {/* Action buttons with hover effects */}
          <div className="error-actions">
            <Button asChild variant="outline" className="error-button">
              <Link href="/blog">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Blog
              </Link>
            </Button>
          </div>

          {/* Blog Roll - Small with staggered animations */}
          {recentPosts.length > 0 && (
            <div className="blog-roll-container">
              <h2 className="blog-roll-title">
                Recent Posts
              </h2>
              <div className="blog-roll-list">
                {recentPosts.map((p, index) => (
                  <Link
                    key={p.slug}
                    href={`/blog/${p.slug}`}
                    className="blog-roll-item"
                    style={{ animationDelay: `${0.3 + index * 0.1}s` }}
                  >
                    <span className="blog-roll-bullet">•</span>
                    <span className="blog-roll-text">{p.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const { html: content } = await markdownToHtml(post.content)
  const tableOfContents = getTableOfContents(post.content)

  // Get related posts based on category or tags
  const allPosts = await fetchAllPostsFromDB()
  const relatedPosts = allPosts
    .filter(
      (p) => p.slug !== post.slug && (p.category === post.category || p.tags.some((tag) => post.tags.includes(tag))),
    )
    .slice(0, 3)

  // Estimate reading time (average reading speed: 200 words per minute)
  const wordCount = post.content.split(/\s+/).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://peridot.finance"
  const canonicalUrl = `${baseUrl}/blog/${post.slug}`
  const ogImage = post.coverImage && !post.coverImage.includes("placeholder")
    ? post.coverImage
    : `${baseUrl}/misc/thumbnail-preview.webp`

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url: canonicalUrl,
    datePublished: post.date,
    image: { "@type": "ImageObject", url: ogImage, width: 1200, height: 630 },
    author: { "@type": "Person", name: post.author.name },
    publisher: {
      "@type": "Organization",
      name: "Peridot",
      url: baseUrl,
      logo: { "@type": "ImageObject", url: `${baseUrl}/misc/thumbnail-preview.webp` },
    },
    mainEntityOfPage: canonicalUrl,
    keywords: post.tags.join(", "),
    wordCount,
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",  item: baseUrl },
      { "@type": "ListItem", position: 2, name: "Blog",  item: `${baseUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  }

  const faq = Array.isArray((post as any).faq) ? (post as any).faq as Array<{ question: string; answer: string }> : []
  const faqSchema = faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  } : null

  return (
    <>
      <Script id={`blog-article-schema-${post.slug}`} type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <Script id={`blog-breadcrumb-schema-${post.slug}`} type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {faqSchema && (
        <Script id={`blog-faq-schema-${post.slug}`} type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}
    <div className="flex flex-col min-h-screen">
      {/* Hero Section with Cover Image */}
      <section className="relative h-[40vh] md:h-[50vh] lg:h-[60vh] overflow-hidden">
        <Image
          src={post.coverImage || `/placeholder.svg?height=800&width=1600&query=${post.title}`}
          alt={post.title}
          fill
          priority
          className="object-cover"
          unoptimized={post.coverImage?.includes('r2.dev') || post.coverImage?.includes('cdn.peridot.finance') || false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-background/80" />
        <div className="absolute inset-0 flex items-center">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href="/blog"
              className="inline-flex items-center text-sm font-medium text-primary mb-6 hover:underline"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Blog
            </Link>
            <div className="max-w-3xl">
              <div className="mb-2 flex items-center">
                <span className="bg-primary/20 text-primary px-2 py-1 rounded-full text-xs font-medium">
                  {post.category}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">{post.title}</h1>
              <div className="flex flex-wrap items-center text-sm text-text/70 gap-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center mr-2 overflow-hidden">
                    {post.author.picture ? (
                      <Image
                        src={post.author.picture || "/placeholder.svg"}
                        alt={post.author.name}
                        width={32}
                        height={32}
                        unoptimized={post.author.picture?.includes('r2.dev') || post.author.picture?.includes('cdn.peridot.finance') || false}
                      />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <span>{post.author.name}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  <span>{readingTime} min read</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Article Content */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Sidebar with Table of Contents - visible on large screens */}
            <div className="hidden lg:block lg:col-span-3 xl:col-span-2">
              <div className="sticky top-24">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-3">Table of Contents</h3>
                  <nav>
                    <ul className="space-y-2 text-sm">
                      {tableOfContents.map((item: TableOfContentsItem) => {
                        // Different styling based on heading level
                        const isLevel2 = item.level === 2
                        const borderWidth = isLevel2 ? "3px" : "2px"
                        const borderOpacity = isLevel2 ? "0.8" : "0.5"
                        // Level 2 uses primary color, Level 3 uses primary with reduced opacity
                        const textColor = isLevel2 
                          ? "text-primary" 
                          : "text-primary/70 dark:text-primary/60"
                        const fontWeight = isLevel2 ? "font-semibold" : "font-medium"
                        
                        return (
                          <li 
                            key={item.slug} 
                            style={{ 
                              marginLeft: `${(item.level - 2) * 12}px`,
                              borderLeft: `${borderWidth} solid hsl(var(--primary) / ${borderOpacity})`,
                              paddingLeft: "12px",
                            }}
                          >
                            <a
                              href={`#${item.slug}`}
                              className={`${textColor} ${fontWeight} hover:text-primary hover:underline transition-colors`}
                            >
                              {item.title}
                            </a>
                          </li>
                        )
                      })}
                    </ul>
                  </nav>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-3">Share</h3>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="icon" className="rounded-full" aria-label="Share on Twitter">
                      <Twitter className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-full" aria-label="Share on LinkedIn">
                      <Linkedin className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-full" aria-label="Copy link">
                      <LinkIcon className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border/30">
                  <h3 className="text-lg font-bold mb-3">Explore</h3>
                  <div className="flex flex-col gap-2 text-sm">
                    <Link href="/glossary" className="text-primary hover:underline">DeFi Glossary</Link>
                    <Link href="/how-it-works" className="text-primary hover:underline">How Peridot works</Link>
                    <Link href="/agents" className="text-primary hover:underline">AI Agents</Link>
                    <Link href="/app" className="text-primary hover:underline font-semibold">Launch App →</Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-7 xl:col-span-8">
              {/* Mobile Table of Contents - collapsible on mobile */}
              <MobileTableOfContents items={tableOfContents} />
              <AskWithAI title={post.title} slug={post.slug} markdownContent={post.content} excerpt={post.excerpt} />
              <article className="prose prose-invert max-w-none">
                <ArticleContent html={content} />
              </article>

              {/* Tags */}
              <div className="mt-12 pt-6 border-t border-border/30">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="h-4 w-4 text-text/60" />
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/blog/tag/${tag.toLowerCase().replace(/\s+/g, "-")}`}
                      className="bg-secondary/30 text-text/70 hover:bg-secondary/50 px-3 py-1 rounded-full text-xs"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Author Bio */}
              <div className="mt-12">
                <Card className="bg-card border-border/50">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                      <div className="w-20 h-20 rounded-full bg-muted flex-shrink-0 overflow-hidden">
                        {post.author.picture ? (
                          <Image
                            src={post.author.picture || "/placeholder.svg"}
                            alt={post.author.name}
                            width={80}
                            height={80}
                            unoptimized={post.author.picture?.includes('r2.dev') || post.author.picture?.includes('cdn.peridot.finance') || false}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="h-10 w-10 text-text/40" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-2 text-center sm:text-left">{post.author.name}</h3>
                        {('authorBio' in post && (post as any).authorBio) ? (
                          <p className="text-text/70 mb-4">{(post as any).authorBio}</p>
                        ) : null}
                        <div className="flex justify-center sm:justify-start space-x-3">
                          {('authorLinks' in post && (post as any).authorLinks?.x) ? (
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="X/Twitter">
                              <Link href={(post as any).authorLinks.x} target="_blank" rel="noopener noreferrer"><Twitter className="h-4 w-4" /></Link>
                            </Button>
                          ) : null}
                          {('authorLinks' in post && (post as any).authorLinks?.linkedin) ? (
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="LinkedIn">
                              <Link href={(post as any).authorLinks.linkedin} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" /></Link>
                            </Button>
                          ) : null}
                          {('authorLinks' in post && (post as any).authorLinks?.website) || ('authorUrl' in post && (post as any).authorUrl) ? (
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="Website">
                              <Link href={(post as any).authorLinks?.website || (post as any).authorUrl} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" /></Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* FAQ Section */}
              {Array.isArray((post as any).faq) && (post as any).faq.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-2xl font-bold mb-4">Frequently Asked Questions</h3>
                  <div className="space-y-4">
                    {(post as any).faq.map((item: { question: string; answer: string }, idx: number) => (
                      <Card key={idx} className="bg-card border-border/50">
                        <CardContent className="p-6">
                          <div className="font-semibold mb-2">{item.question}</div>
                          <div className="text-text/80">{item.answer}</div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Mobile Share Buttons */}
              <div className="mt-8 lg:hidden">
                <h3 className="text-lg font-bold mb-3">Share this article</h3>
                <div className="flex space-x-3">
                  <Button variant="outline" className="rounded-full" aria-label="Share on Twitter">
                    <Twitter className="h-4 w-4 mr-2" />
                    
                  </Button>
                  <Button variant="outline" className="rounded-full" aria-label="Share on LinkedIn">
                    <Linkedin className="h-4 w-4 mr-2" />
                    
                  </Button>
                  <Button variant="outline" className="rounded-full" aria-label="Copy link">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    
                  </Button>
                </div>
              </div>

              {/* Mobile Table of Contents moved above */}
            </div>
          </div>
        </div>
      </section>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="py-12 bg-muted">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold mb-8">Related Articles</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedPosts.map((post) => (
                <PostPreview key={post.slug} post={post} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Next/Prev Navigation */}
      <section className="py-8 bg-background border-t border-border/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between">
            <Button asChild variant="ghost" className="mb-4 sm:mb-0">
              <Link href="/blog" className="flex items-center">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to All Articles
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/blog" className="flex items-center">
                Explore More Articles
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
    </>
  )
}

