# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorLegacyMigrationTest < ActiveSupport::TestCase
  def test_uses_the_file_response_for_migrated_attachments
    migration = RedmineCkeditor::LegacyMigration.new
    attachment = stub(id: 42, filename: 'test image.png')

    assert_equal(
      '/attachments/download/42/test%20image.png',
      migration.send(:attachment_url, attachment)
    )
  end

  def test_rewrites_relative_and_absolute_rich_urls
    migration = RedmineCkeditor::LegacyMigration.new
    path = '/system/rich/rich_files/rich_files/000/000/001/original/test.png'
    content = <<~HTML.strip
      <img src="https://old.example.test/redmine#{path}"><a href='#{path}'>file</a>
    HTML

    rewritten = migration.send(:rewrite_urls, content, path => '/attachments/42/test.png')

    assert_equal(
      '<img src="/attachments/42/test.png"><a href=\'/attachments/42/test.png\'>file</a>',
      rewritten
    )
  end

  def test_does_not_rewrite_plain_text_that_only_looks_like_a_url
    migration = RedmineCkeditor::LegacyMigration.new
    path = '/system/rich/rich_files/rich_files/000/000/001/original/test.png'

    assert_equal path, migration.send(:rewrite_urls, path, path => '/attachments/42/test.png')
  end

  def run_migration_up(flag)
    require Rails.root.join('plugins/redmine_ckeditor/db/migrate/20260721000000_migrate_rich_uploads_to_attachments')
    result = RedmineCkeditor::LegacyMigration::Result.new(migrated: 1, skipped: 0, failed: 0, rewritten: 0)
    old = ENV['REDMINE_CKEDITOR_MIGRATE_RICH']
    flag.nil? ? ENV.delete('REDMINE_CKEDITOR_MIGRATE_RICH') : ENV['REDMINE_CKEDITOR_MIGRATE_RICH'] = flag
    ActiveRecord::Migration.suppress_messages do
      yield result
      MigrateRichUploadsToAttachments.new.up
    end
  ensure
    old.nil? ? ENV.delete('REDMINE_CKEDITOR_MIGRATE_RICH') : ENV['REDMINE_CKEDITOR_MIGRATE_RICH'] = old
  end

  def test_plugin_migration_skips_rich_conversion_without_flag
    run_migration_up(nil) do |_result|
      RedmineCkeditor::LegacyMigration.any_instance.expects(:up).never
    end
  end

  def test_plugin_migration_skips_rich_conversion_with_other_flag_value
    run_migration_up('0') do |_result|
      RedmineCkeditor::LegacyMigration.any_instance.expects(:up).never
    end
  end

  def test_plugin_migration_runs_rich_conversion_with_flag
    run_migration_up('1') do |result|
      RedmineCkeditor::LegacyMigration.any_instance.expects(:up).once.returns(result)
    end
  end

  def test_plugin_tables_guard_reflects_table_presence
    migration = RedmineCkeditor::LegacyMigration.new
    assert migration.plugin_tables?

    ActiveRecord::Base.connection.stubs(:data_source_exists?).returns(false)
    assert_not migration.plugin_tables?
    assert_not migration.legacy_table?
  end
end
