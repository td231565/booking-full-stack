import AutocompleteDemo from "@/demo/autocomplete/parent";

// Demo 路由：並排對照 Uncontrolled 與 Hybrid 受控 Autocomplete 的 re-render 差異
export default function AutocompleteDemoPage() {
  return (
    <main className="min-h-screen bg-white">
      <AutocompleteDemo />
    </main>
  );
}
