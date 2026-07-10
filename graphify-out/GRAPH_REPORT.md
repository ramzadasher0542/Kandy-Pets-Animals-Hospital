# Graph Report - .  (2026-07-10)

## Corpus Check
- 90 files · ~78,292 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 397 nodes · 913 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.84)
- Token cost: 300,705 input · 0 output

## Community Hubs (Navigation)
- Clinic Feature Types & Boarding
- App Shell & Authentication
- Appointments Scheduling Logic
- Local Database & Financial Reports
- NPM Package Dependencies
- Postgres Skill Docs & Guidelines
- Supabase Skill Changelog & Feedback
- Inventory & System Settings
- TypeScript Configuration
- Postgres Performance & Monitoring
- PWA Manifest Config
- Postgres Index Types
- Postgres Schema & Primary Keys
- Postgres RLS Security
- React Error Boundary
- Postgres Query Index Strategies
- App Entry & Setup Docs
- App Branding & Logos
- Clinical Lab Constants

## God Nodes (most connected - your core abstractions)
1. `showToast()` - 30 edges
2. `stampRecord()` - 26 edges
3. `MedicalRecord` - 23 edges
4. `App()` - 22 edges
5. `formatDisplayDate()` - 21 edges
6. `InventoryItem` - 20 edges
7. `Pet` - 19 edges
8. `Appointment` - 18 edges
9. `Client` - 17 edges
10. `SyncEngine` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Kandy Pets VHMS Project Rules (CLAUDE.md)` --semantically_similar_to--> `Core Principles`  [INFERRED] [semantically similar]
  CLAUDE.md → .agents/skills/supabase/SKILL.md
- `Kandy Pets VHMS Project Rules (CLAUDE.md)` --semantically_similar_to--> `Making and Committing Schema Changes Workflow`  [INFERRED] [semantically similar]
  CLAUDE.md → .agents/skills/supabase/SKILL.md
- `safeDbWrite()` --references--> `localforage`  [EXTRACTED]
  src/lib/localDb.ts → package.json
- `Kandy Pets VHMS Project Rules (CLAUDE.md)` --conceptually_related_to--> `Supabase MCP Server`  [INFERRED]
  CLAUDE.md → .agents/skills/supabase/SKILL.md
- `Run Locally Instructions (README)` --conceptually_related_to--> `index.html App Entry Point (Ceylon Pets APS)`  [INFERRED]
  README.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Rule Files Conforming to Template Structure** — agents_skills_supabase_postgres_best_practices_references__template_template, agents_skills_supabase_postgres_best_practices_references_advanced_full_text_search_tsvector_full_text_search_rule, agents_skills_supabase_postgres_best_practices_references_advanced_jsonb_indexing_jsonb_indexing_rule, agents_skills_supabase_postgres_best_practices_references_conn_idle_timeout_idle_connection_timeout_rule, agents_skills_supabase_postgres_best_practices_references_conn_limits_connection_limits_rule, agents_skills_supabase_postgres_best_practices_references_conn_pooling_connection_pooling_rule, agents_skills_supabase_postgres_best_practices_references_conn_prepared_statements_prepared_statements_pooling_rule, agents_skills_supabase_postgres_best_practices_references_data_batch_inserts_batch_insert_rule, agents_skills_supabase_postgres_best_practices_references_data_n_plus_one_n_plus_one_elimination_rule, agents_skills_supabase_postgres_best_practices_references_data_pagination_cursor_pagination_rule, agents_skills_supabase_postgres_best_practices_references_data_upsert_upsert_rule, agents_skills_supabase_postgres_best_practices_references_lock_advisory_advisory_locks_rule, agents_skills_supabase_postgres_best_practices_references_lock_deadlock_prevention_deadlock_prevention_rule, agents_skills_supabase_postgres_best_practices_references_lock_short_transactions_short_transactions_rule [INFERRED 0.85]
- **Connection Management Rule Group** — agents_skills_supabase_postgres_best_practices_references__sections_connection_management, agents_skills_supabase_postgres_best_practices_references_conn_idle_timeout_idle_connection_timeout_rule, agents_skills_supabase_postgres_best_practices_references_conn_limits_connection_limits_rule, agents_skills_supabase_postgres_best_practices_references_conn_pooling_connection_pooling_rule, agents_skills_supabase_postgres_best_practices_references_conn_prepared_statements_prepared_statements_pooling_rule [EXTRACTED 1.00]
- **Concurrency & Locking Rule Group** — agents_skills_supabase_postgres_best_practices_references__sections_concurrency_locking, agents_skills_supabase_postgres_best_practices_references_lock_advisory_advisory_locks_rule, agents_skills_supabase_postgres_best_practices_references_lock_deadlock_prevention_deadlock_prevention_rule, agents_skills_supabase_postgres_best_practices_references_lock_short_transactions_short_transactions_rule [EXTRACTED 1.00]
- **PostgreSQL Indexing Optimization Strategies** — agents_skills_supabase_postgres_best_practices_references_query_missing_indexes_missing_indexes, agents_skills_supabase_postgres_best_practices_references_query_composite_indexes_composite_index, agents_skills_supabase_postgres_best_practices_references_query_covering_indexes_covering_index, agents_skills_supabase_postgres_best_practices_references_query_partial_indexes_partial_index, agents_skills_supabase_postgres_best_practices_references_schema_foreign_key_indexes_foreign_key_index, agents_skills_supabase_postgres_best_practices_references_query_index_types_index_types [INFERRED 0.75]
- **PostgreSQL Query Monitoring and Diagnostics Toolkit** — agents_skills_supabase_postgres_best_practices_references_monitor_explain_analyze_explain_analyze, agents_skills_supabase_postgres_best_practices_references_monitor_pg_stat_statements_pg_stat_statements, agents_skills_supabase_postgres_best_practices_references_monitor_vacuum_analyze_vacuum_analyze [INFERRED 0.80]
- **Row Level Security Design and Performance Pattern** — agents_skills_supabase_postgres_best_practices_references_security_rls_basics_row_level_security, agents_skills_supabase_postgres_best_practices_references_security_rls_performance_rls_performance_optimization, agents_skills_supabase_postgres_best_practices_references_security_rls_performance_security_definer_function, agents_skills_supabase_postgres_best_practices_references_security_rls_performance_auth_uid_function, agents_skills_supabase_postgres_best_practices_references_security_privileges_least_privilege [INFERRED 0.75]
- **Supabase Security Checklist Items** — agents_skills_supabase_skill_security_checklist, agents_skills_supabase_skill_user_metadata_vs_app_metadata, agents_skills_supabase_skill_service_role_exposure, agents_skills_supabase_skill_views_bypass_rls, agents_skills_supabase_skill_update_requires_select_policy, agents_skills_supabase_skill_auth_role_deprecated, agents_skills_supabase_skill_bola_idor, agents_skills_supabase_skill_update_policy_using_with_check, agents_skills_supabase_skill_security_definer_bypasses_rls, agents_skills_supabase_skill_security_definer_public_callable, agents_skills_supabase_skill_storage_upsert_permissions, agents_skills_supabase_skill_npm_supply_chain_security [EXTRACTED 1.00]
- **Schema Change Workflow (Skill + Project Rules)** — agents_skills_supabase_skill_schema_changes_workflow, agents_skills_supabase_skill_cli, agents_skills_supabase_skill_mcp_server, claude_project_rules [INFERRED 0.85]

## Communities (24 total, 4 thin omitted)

### Community 0 - "Clinic Feature Types & Boarding"
Cohesion: 0.08
Nodes (52): AppointmentsProps, ALL_SPACES, BoardingProps, CONDO_SPACES, KENNEL_SPACES, CustomersManagerProps, DashboardProps, GROOMING_SERVICES (+44 more)

### Community 1 - "App Shell & Authentication"
Cohesion: 0.09
Nodes (41): App(), hashPin(), Props, State, DashboardAnalytics(), AlertsProps, addToClinicQueue(), atomicStockDecrement() (+33 more)

### Community 2 - "Appointments Scheduling Logic"
Cohesion: 0.10
Nodes (38): react, AppointmentsManager(), enforcePhoneFormat(), getNextAptNumber(), normalizeSearchPhone(), toLocalISODate(), BoardingManager(), CustomersManager() (+30 more)

### Community 3 - "Local Database & Financial Reports"
Cohesion: 0.08
Nodes (16): localforage, CashAdjustment, cashDb, ReportsManager(), VaultInvoice, db, initializeDatabaseVault(), safeDbWrite() (+8 more)

### Community 4 - "NPM Package Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, dotenv, @emailjs/browser, express, @google/genai, lucide-react, motion, react-dom (+26 more)

### Community 5 - "Postgres Skill Docs & Guidelines"
Cohesion: 0.11
Nodes (33): Changelog, Schema-Constraints Reference Feature (v1.2.0/v1.3.0), Security Checklist (SECURITY DEFINER, auth.role() deprecation, BOLA), Concrete Transformation Patterns Principle, Error-First Structure Principle, Quantified Impact Principle, Self-Contained Examples Principle, Semantic Naming Principle (+25 more)

### Community 6 - "Supabase Skill Changelog & Feedback"
Cohesion: 0.11
Nodes (29): Feedback Issue Template, Supabase Agent Skills Changelog, Feature: instructions on exposing tables to the Data API, Feature: npm supply-chain security guidance, Fix: cover SECURITY DEFINER, auth.role() deprecation, and BOLA in security checklist, Changelog v0.1.3 (2026-06-02), Changelog v0.1.4 (2026-06-05), Skill Feedback Reference Guide (+21 more)

### Community 7 - "Inventory & System Settings"
Cohesion: 0.10
Nodes (18): CATEGORIES, InventoryManager(), InventoryProps, SettingsProps, SystemConfig, SystemSettings(), toastListeners, ToastMessage (+10 more)

### Community 8 - "TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, allowJs, experimentalDecorators, isolatedModules, jsx, lib, module (+8 more)

### Community 9 - "Postgres Performance & Monitoring"
Cohesion: 0.22
Nodes (9): SKIP LOCKED for Non-Blocking Queue Processing, EXPLAIN ANALYZE for Diagnosing Slow Queries, pg_stat_statements Extension for Query Analysis, Autovacuum Tuning, VACUUM and ANALYZE for Table Statistics Maintenance, Indexes on WHERE and JOIN Columns, Adding Constraints Safely in Migrations, Indexing Foreign Key Columns (+1 more)

### Community 10 - "PWA Manifest Config"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 11 - "Postgres Index Types"
Cohesion: 0.33
Nodes (6): BRIN Index, B-tree Index, GIN Index, GiST Index, Hash Index, Choosing the Right Index Type

### Community 12 - "Postgres Schema & Primary Keys"
Cohesion: 0.33
Nodes (6): Choosing Appropriate Data Types, Lowercase Identifiers for Compatibility, IDENTITY Column (bigint generated always as identity), Optimal Primary Key Strategy, Random UUID (v4) Primary Key, Time-Ordered UUID (UUIDv7) Primary Key

### Community 13 - "Postgres RLS Security"
Cohesion: 0.50
Nodes (5): Principle of Least Privilege, Row Level Security for Multi-Tenant Data, auth.uid() Function, Optimizing RLS Policies for Performance, SECURITY DEFINER Helper Function

### Community 15 - "Postgres Query Index Strategies"
Cohesion: 0.67
Nodes (3): Composite Indexes for Multi-Column Queries, Covering Indexes to Avoid Table Lookups, Partial Indexes for Filtered Queries

## Ambiguous Edges - Review These
- `SKIP LOCKED for Non-Blocking Queue Processing` → `Indexes on WHERE and JOIN Columns`  [AMBIGUOUS]
  .agents/skills/supabase-postgres-best-practices/references/lock-skip-locked.md · relation: conceptually_related_to

## Knowledge Gaps
- **106 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+101 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `SKIP LOCKED for Non-Blocking Queue Processing` and `Indexes on WHERE and JOIN Columns`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `dependencies` connect `NPM Package Dependencies` to `Appointments Scheduling Logic`, `Local Database & Financial Reports`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `react` connect `Appointments Scheduling Logic` to `NPM Package Dependencies`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `safeDbWrite()` connect `Local Database & Financial Reports` to `App Shell & Authentication`, `Inventory & System Settings`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Clinic Feature Types & Boarding` be split into smaller, more focused modules?**
  _Cohesion score 0.08038914490527393 - nodes in this community are weakly interconnected._
- **Should `App Shell & Authentication` be split into smaller, more focused modules?**
  _Cohesion score 0.08754208754208755 - nodes in this community are weakly interconnected._