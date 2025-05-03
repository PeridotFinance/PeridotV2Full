import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Calendar, Clock, Tag, User, ArrowLeft, Twitter, Linkedin, LinkIcon, ArrowRight, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getPostBySlug, getPostSlugs, markdownToHtml, getTableOfContents, getAllPosts } from "@/lib/blog-utils"
import PostPreview from "@/components/blog/post-preview"
import type { TableOfContentsItem } from "@/types/blog"
import "./blog-content.css"

type Props = {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPostBySlug(params.slug)

  if (!post) {
    return {
      title: "Post Not Found",
    }
  }

  return {
    title: `${post.title} | Peridot Blog`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author.name],
      images: [
        {
          url: post.coverImage || `/placeholder.svg?height=630&width=1200&query=${post.title}`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
      tags: post.tags,
    },
  }
}

export async function generateStaticParams() {
  const posts = getPostSlugs()

  return posts.map((slug) => ({
    slug,
  }))
}

export default async function BlogPost({ params }: Props) {
  const post = getPostBySlug(params.slug)

  if (!post) {
    notFound()
  }

  const content = await markdownToHtml(post.content)
  const tableOfContents = getTableOfContents(post.content)

  // Get related posts based on category or tags
  const allPosts = getAllPosts()
  const relatedPosts = allPosts
    .filter(
      (p) => p.slug !== post.slug && (p.category === post.category || p.tags.some((tag) => post.tags.includes(tag))),
    )
    .slice(0, 3)

  // Estimate reading time (average reading speed: 200 words per minute)
  const wordCount = post.content.split(/\s+/).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section with Cover Image */}
      <section className="relative h-[40vh] md:h-[50vh] lg:h-[60vh] overflow-hidden">
        <Image
          src={post.coverImage || `/placeholder.svg?height=800&width=1600&query=${post.title}`}
          alt={post.title}
          fill
          priority
          className="object-cover"
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
                      {tableOfContents.map((item: TableOfContentsItem) => (
                        <li key={item.slug} style={{ marginLeft: `${(item.level - 2) * 12}px` }}>
                          <a
                            href={`#${item.slug}`}
                            className="text-text/70 hover:text-primary hover:underline transition-colors"
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
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
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-7 xl:col-span-8">
              <article className="prose prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: content }} />
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
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="h-10 w-10 text-text/40" />
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-2 text-center sm:text-left">{post.author.name}</h3>
                        <p className="text-text/70 mb-4">
                          Author specializing in decentralized finance, blockchain technology, and cryptocurrency
                          markets. Passionate about making complex financial concepts accessible to everyone.
                        </p>
                        <div className="flex justify-center sm:justify-start space-x-3">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <Twitter className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <Linkedin className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <Globe className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Mobile Share Buttons */}
              <div className="mt-8 lg:hidden">
                <h3 className="text-lg font-bold mb-3">Share this article</h3>
                <div className="flex space-x-3">
                  <Button variant="outline" className="rounded-full" aria-label="Share on Twitter">
                    <Twitter className="h-4 w-4 mr-2" />
                    Twitter
                  </Button>
                  <Button variant="outline" className="rounded-full" aria-label="Share on LinkedIn">
                    <Linkedin className="h-4 w-4 mr-2" />
                    LinkedIn
                  </Button>
                  <Button variant="outline" className="rounded-full" aria-label="Copy link">
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Copy Link
                  </Button>
                </div>
              </div>

              {/* Mobile Table of Contents */}
              <div className="mt-8 lg:hidden">
                <Card className="bg-card border-border/50">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-bold mb-3">Table of Contents</h3>
                    <nav>
                      <ul className="space-y-2 text-sm">
                        {tableOfContents.map((item: TableOfContentsItem) => (
                          <li key={item.slug} style={{ marginLeft: `${(item.level - 2) * 12}px` }}>
                            <a
                              href={`#${item.slug}`}
                              className="text-text/70 hover:text-primary hover:underline transition-colors"
                            >
                              {item.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </CardContent>
                </Card>
              </div>
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
  )
}
