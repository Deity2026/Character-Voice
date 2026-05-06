import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getApiBase } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import type { Book } from "@shared/schema";
import {
  BookOpen, Headphones, Plus, Upload, Trash2, Play, Users, Layers,
  Sun, Moon, Home, Loader2, Wand2, ChevronRight, FileText
} from "lucide-react";

export default function LibraryPage() {
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<"file" | "text">("file");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: books = [], isLoading } = useQuery<Book[]>({
    queryKey: ["/api/books"],
  });

  const resetUploadForm = () => {
    setTitle("");
    setAuthor("");
    setText("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadBook = useMutation({
    mutationFn: () => apiRequest("POST", "/api/books", { title, author, text }),
    onSuccess: async (res) => {
      const book = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      setUploadOpen(false);
      resetUploadForm();
      toast({ title: "Book uploaded and processing complete" });
      navigate(`/reader/${book.id}`);
    },
    onError: () => {
      toast({ title: "Failed to upload book", variant: "destructive" });
    },
  });

  // File upload uses FormData, which apiRequest doesn't handle directly
  // (it forces JSON content type). We call fetch directly here.
  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title) fd.append("title", title);
      if (author) fd.append("author", author);
      const res = await fetch(`${getApiBase()}/api/books/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const book = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      setUploadOpen(false);
      resetUploadForm();
      toast({ title: `Imported "${book.title}"` });
      navigate(`/reader/${book.id}`);
    } catch (e: any) {
      toast({
        title: "Couldn't import that file",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const loadDemo = useMutation({
    mutationFn: () => apiRequest("POST", "/api/books/demo"),
    onSuccess: async (res) => {
      const book = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      navigate(`/reader/${book.id}`);
    },
  });

  const deleteBook = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/books/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books"] });
      toast({ title: "Book removed" });
    },
  });

  return (
    <div className="min-h-screen bg-background" data-testid="library-page">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Headphones className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg tracking-tight">CharacterVoice</span>
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/pricing">
            <Button variant="ghost" size="sm">Pricing</Button>
          </Link>
          <Link href="/account">
            <Button variant="ghost" size="sm">Account</Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm">
              <Home className="w-4 h-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold">My Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {books.length} {books.length === 1 ? "book" : "books"} in your library
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDemo.mutate()}
              disabled={loadDemo.isPending}
              data-testid="button-load-demo"
            >
              {loadDemo.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Load Demo
            </Button>
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-upload">
                  <Plus className="w-4 h-4 mr-2" />
                  Upload Book
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Upload a Book</DialogTitle>
                </DialogHeader>
                <Tabs
                  value={uploadMode}
                  onValueChange={(v) => setUploadMode(v as "file" | "text")}
                  className="mt-2"
                >
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="file" data-testid="tab-file">
                      <FileText className="w-3.5 h-3.5 mr-1.5" /> Upload file
                    </TabsTrigger>
                    <TabsTrigger value="text" data-testid="tab-text">
                      Paste text
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="file" className="space-y-4 mt-4">
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) setFile(f);
                      }}
                      data-testid="file-dropzone"
                    >
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        {file ? file.name : "Choose a file or drop it here"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, EPUB, DOCX, or TXT · up to 25 MB
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.epub,.docx,.txt,application/pdf,application/epub+zip,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        data-testid="input-file"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1 block text-muted-foreground">
                          Title (optional)
                        </label>
                        <Input
                          placeholder="Auto-detected"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          data-testid="input-title-file"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium mb-1 block text-muted-foreground">
                          Author (optional)
                        </label>
                        <Input
                          placeholder="Auto-detected"
                          value={author}
                          onChange={(e) => setAuthor(e.target.value)}
                          data-testid="input-author-file"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      disabled={!file || uploading}
                      onClick={uploadFile}
                      data-testid="button-submit-file"
                    >
                      {uploading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading file...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-2" /> Import & analyze</>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="text" className="space-y-4 mt-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Title</label>
                      <Input
                        placeholder="e.g. The Great Gatsby"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        data-testid="input-title"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Author</label>
                      <Input
                        placeholder="e.g. F. Scott Fitzgerald"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        data-testid="input-author"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Book Text</label>
                      <Textarea
                        placeholder="Paste the full text of your book here..."
                        rows={8}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        data-testid="input-text"
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!title || !text || uploadBook.isPending}
                      onClick={() => uploadBook.mutate()}
                      data-testid="button-submit-upload"
                    >
                      {uploadBook.isPending ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-2" /> Upload & analyze</>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Book Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">Your library is empty</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => loadDemo.mutate()}>
                <Wand2 className="w-4 h-4 mr-2" /> Load Demo Book
              </Button>
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Upload Book
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map(book => (
              <BookCard
                key={book.id}
                book={book}
                onDelete={() => deleteBook.mutate(book.id)}
                onPlay={() => navigate(`/reader/${book.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookCard({ book, onDelete, onPlay }: { book: Book; onDelete: () => void; onPlay: () => void }) {
  return (
    <Card
      className="group relative overflow-hidden border-border/60 hover:border-primary/30 transition-colors cursor-pointer"
      onClick={onPlay}
      data-testid={`card-book-${book.id}`}
    >
      {/* Color accent bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: book.coverColor || "#6366f1" }} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{book.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{book.author}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
            data-testid={`button-delete-${book.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {book.totalCharacters || 0} characters
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {book.totalChapters || 1} {(book.totalChapters || 1) === 1 ? "chapter" : "chapters"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            book.status === "ready"
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : book.status === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          }`}>
            {book.status === "ready" ? "Ready" : book.status === "error" ? "Error" : "Processing"}
          </span>
          <div className="flex items-center gap-1 text-xs text-primary font-medium">
            <Play className="w-3 h-3" />
            Listen
            <ChevronRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </Card>
  );
}
