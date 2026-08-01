import { PageLayout } from "@/components/layout/PageLayout";
import { HeroSection } from "@/features/welcome/components/HeroSection";
import { HowItWorksSection } from "@/features/welcome/components/HowItWorksSection";
import { FeatureGrid } from "@/features/welcome/components/FeatureGrid";
import { McpConfigGuide } from "@/features/welcome/components/McpConfigGuide";
import { McpToolExplorer } from "@/features/welcome/components/McpToolExplorer";

export function LandingPage() {
  return (
    <PageLayout maxWidth="6xl">
      <HeroSection />
      <HowItWorksSection />
      <McpToolExplorer />
      <McpConfigGuide />
      <FeatureGrid />
    </PageLayout>
  );
}
