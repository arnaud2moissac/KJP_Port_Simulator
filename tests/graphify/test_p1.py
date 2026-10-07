"""Regression tests for the three Graphify P1 fixes; run with its Python runtime."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

from graphify.build import build_from_json
from graphify.cluster import cluster, cohesion_score
from graphify.export import to_html, to_json
from graphify.extract import extract
from graphify.paths import load_node_link_graph
from graphify.serve import _query_graph_text
from graphify.watch import _batch_triggers_rebuild, _rebuild_code

PROJECT = Path(__file__).resolve().parents[2]


class GraphifyP1(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="kjp-graphify-test-")
        self.root = Path(self.directory.name)

    def tearDown(self):
        self.directory.cleanup()

    def file(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def ast(self, *paths):
        return extract(list(paths), root=self.root, cache_root=self.root, parallel=False)

    def calls(self, result):
        nodes = {node["id"]: node for node in result["nodes"]}
        return [(nodes[edge["source"]], nodes[edge["target"]], edge)
                for edge in result["edges"] if edge["relation"] == "calls"
                and edge["source"] in nodes and edge["target"] in nodes]

    def graph_fixture(self):
        nodes = [{"id": name, "label": {"a": "alpha", "b": "beta"}[name], "file_type": "code", "source_file": "a.js",
                  "source_location": f"L{index}"} for index, name in enumerate(("a", "b"), 1)]
        facts = [("a", "b", "contains", "L1"), ("a", "b", "calls", "L2"),
                 ("a", "b", "calls", "L3"), ("b", "a", "calls", "L4")]
        edges = [{"source": source, "target": target, "relation": relation,
                  "source_file": "a.js", "source_location": line, "confidence": "EXTRACTED",
                  "context": "call" if relation == "calls" else "definition"}
                 for source, target, relation, line in facts]
        return build_from_json({"nodes": nodes, "edges": edges + [dict(edges[0])]}, root=self.root)

    def test_unknown_receivers_do_not_create_recursion(self):
        path = self.file("a.js", "function render(renderer) { renderer.render(); }\n"
                         "function dispose(resource) { resource?.dispose(); }\n")
        self.assertFalse(self.calls(self.ast(path)))

    def test_real_recursion_survives_in_javascript_and_typescript(self):
        for suffix in ("js", "ts"):
            path = self.file(f"recursive.{suffix}", "function recur(n) { if (n) recur(n-1); }\n")
            calls = self.calls(self.ast(path))
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0][0]["id"], calls[0][1]["id"])

    def test_bare_call_and_this_method_have_distinct_targets(self):
        path = self.file("a.js", "function helper() {}\n"
                         "class Api { helper() {} run() { this.helper(); helper(); } }\n")
        targets = [target["label"] for _, target, _ in self.calls(self.ast(path))]
        self.assertCountEqual(targets, ["helper()", ".helper()"])

    def test_parameter_shadowing_does_not_call_global_function(self):
        path = self.file("a.js", "function helper() {}\nfunction run(helper) { helper(); }\n")
        self.assertFalse(self.calls(self.ast(path)))

    def test_known_named_import_still_resolves(self):
        library = self.file("lib.js", "export function work() {}\n")
        main = self.file("main.js", "import { work } from './lib.js';\nfunction run() { work(); }\n")
        self.assertTrue(any(target["source_file"] == "lib.js" and target["label"] == "work()"
                            for _, target, _ in self.calls(self.ast(library, main))))

    def test_containment_call_sites_and_reverse_direction_survive(self):
        graph = self.graph_fixture()
        self.assertTrue(graph.is_multigraph())
        self.assertEqual(graph.number_of_edges(), 4)
        facts = {(data["_src"], data["_tgt"], data["relation"], data["source_location"])
                 for _, _, data in graph.edges(data=True)}
        self.assertIn(("a", "b", "contains", "L1"), facts)
        self.assertIn(("b", "a", "calls", "L4"), facts)
        self.assertEqual(sum(fact[2] == "calls" for fact in facts), 3)

    def test_json_round_trip_is_lossless(self):
        graph = self.graph_fixture()
        path = self.root / "graph.json"
        self.assertTrue(to_json(graph, {0: list(graph)}, str(path)))
        data = json.loads(path.read_text())
        self.assertTrue(data["multigraph"])
        loaded = load_node_link_graph(data)
        self.assertEqual(loaded.number_of_edges(), 4)
        second = self.root / "second.json"
        self.assertTrue(to_json(loaded, {0: list(loaded)}, str(second)))
        first_facts = {(e["source"], e["target"], e["relation"], e["source_location"]) for e in data["links"]}
        second_facts = {(e["source"], e["target"], e["relation"], e["source_location"])
                        for e in json.loads(second.read_text())["links"]}
        self.assertEqual(first_facts, second_facts)

    def test_query_and_explain_show_parallel_relations(self):
        graph = self.graph_fixture()
        path = self.root / "graph.json"
        to_json(graph, {0: list(graph)}, str(path))
        text = _query_graph_text(graph, "alpha beta", token_budget=4000,
                                 graph_path=str(path))
        self.assertIn("contains", text)
        self.assertIn("calls", text)
        result = subprocess.run([sys.executable, "-m", "graphify", "explain", "alpha", "--graph", str(path)],
                                cwd=self.root, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("[contains]", result.stdout)
        self.assertIn("[calls]", result.stdout)

    def test_clustering_uses_connectivity_and_bounded_cohesion(self):
        graph = self.graph_fixture()
        self.assertEqual(cohesion_score(graph, list(graph)), 1.0)
        groups = cluster(graph)
        self.assertEqual({node for values in groups.values() for node in values}, set(graph))

    def test_html_export_preserves_parallel_edges(self):
        graph = self.graph_fixture()
        path = self.root / "graph.html"
        self.assertTrue(to_html(graph, {0: list(graph)}, str(path)))
        text = path.read_text()
        self.assertIn('"label": "contains"', text)
        self.assertIn('"label": "calls"', text)

    def test_inline_scripts_preserve_lines_and_ignore_json_and_external_scripts(self):
        path = self.file("src/template.html", '<p>préface</p>\n'
                         '<script type="application/json">{"function":"ignored"}</script>\n'
                         '<script src="missing.js">function external() {}</script>\n'
                         '<script type="module">\nfunction water(){return 1;}\nwater();\n</script>\n')
        nodes = self.ast(path)["nodes"]
        self.assertTrue(any(node["label"] == "water()" and node["source_location"] == "L5" for node in nodes))
        self.assertFalse(any("external()" == node["label"] for node in nodes))
        self.assertTrue(_batch_triggers_rebuild([path]))

    def test_template_all_named_functions_are_indexed(self):
        source = PROJECT / "src/simulateur-port/template.html"
        text = source.read_text()
        expected = {(match[1], text[:match.start()].count("\n") + 1)
                    for match in re.finditer(r"\bfunction\s+([A-Za-z_$][\w$]*)\s*\(", text)}
        result = extract([source], root=PROJECT, cache_root=self.root, parallel=False)
        actual = {(node["label"].removesuffix("()"), int(node["source_location"][1:]))
                  for node in result["nodes"] if node.get("source_location", "").startswith("L")}
        self.assertTrue(expected)
        self.assertFalse(expected - actual, expected - actual)

    def test_inline_ast_keeps_the_existing_semantic_page(self):
        self.file("src/template.html", "<script>function water(){} water();</script>\n")
        out = self.root / "graphify-out"
        out.mkdir()
        page = {"id": "src_template", "label": "Curated product page", "_origin": "semantic",
                "source_file": "src/template.html", "file_type": "code"}
        (out / "graph.json").write_text(json.dumps({"nodes": [page], "links": [],
                                                    "directed": False, "multigraph": False}))
        self.assertTrue(_rebuild_code(self.root, block_on_lock=True))
        nodes = {n["id"]: n for n in json.loads((out / "graph.json").read_text())["nodes"]}
        self.assertEqual(nodes["src_template"]["label"], "Curated product page")
        self.assertEqual(nodes["src_template"]["_origin"], "semantic")
        modules = [n for n in nodes.values() if n.get("node_kind") == "script_module"]
        self.assertEqual(len(modules), 1)
        self.assertNotEqual(modules[0]["id"], "src_template")

    def test_inline_iife_helpers_bind_locally_and_unknown_aliases_stay_unresolved(self):
        page = self.file("src/template.html", "<script>(() => {\n"
                         "const wrapAngle = angle => angle;\nconst t = api.t;\n"
                         "function run() { return wrapAngle(t('x')); }\n})();</script>\n")
        foreign = self.file("src/other.js", "function wrapAngle(angle) { return angle; }\nfunction t() {}\n")
        result = self.ast(page, foreign)
        calls = self.calls(result)
        self.assertTrue(any(target["label"] == "wrapAngle()"
                            and target["source_file"].endswith("template.html") for _, target, _ in calls))
        self.assertFalse(any(target["source_file"].endswith("other.js") for _, target, _ in calls))
        graph = build_from_json(result, root=self.root)
        self.assertEqual(graph.number_of_edges(), len(result["edges"]))

    def test_known_populate_boats_call_targets_the_function(self):
        source = PROJECT / "src/ports/port-editor-core.js"
        result = extract([source], root=PROJECT, cache_root=self.root, parallel=False)
        calls = [(target, edge) for _, target, edge in self.calls(result)
                 if edge.get("source_location") == "L1101"]
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0]["source_location"], "L730")

    def test_incremental_full_and_unchanged_updates_agree(self):
        path = self.file("a.js", "function main(){ function step(){} step(); }\n")
        self.assertTrue(_rebuild_code(self.root, block_on_lock=True))
        path.write_text("function main(){ function step(){} step(); }\nfunction extra(){}\n")
        self.assertTrue(_rebuild_code(self.root, changed_paths=[path], block_on_lock=True))
        graph_path = self.root / "graphify-out/graph.json"
        data = json.loads(graph_path.read_text())
        self.assertTrue(data["multigraph"])
        self.assertTrue(any(e["relation"] == "calls" for e in data["links"]))
        digest = hashlib.sha256(graph_path.read_bytes()).hexdigest()
        self.assertTrue(_rebuild_code(self.root, block_on_lock=True))
        self.assertEqual(digest, hashlib.sha256(graph_path.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main(verbosity=2)
