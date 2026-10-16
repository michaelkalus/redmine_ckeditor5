# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorMentionablePatchTest < ActiveSupport::TestCase
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses, :issues, :journals,
           :enumerations, :workflows

  def setup
    User.current = nil
    ActionMailer::Base.deliveries.clear
  end

  def scan(html) = Issue.new.send(:scan_for_mentioned_users, html)

  def test_finds_plain_mention_in_html
    with_settings(text_formatting: 'CKEditor') do
      assert_equal ['dlopper'], scan('<p>Hi @dlopper</p>')
    end
  end

  def test_ignores_quotes_code_and_attributes
    with_settings(text_formatting: 'CKEditor') do
      assert_empty scan('<blockquote><p>@dlopper</p></blockquote><pre>@jsmith</pre>' \
                        '<p><code>@admin</code></p><span data-mention="@rhill">x</span>')
    end
  end

  def test_other_formats_are_untouched
    with_settings(text_formatting: 'common_mark') do
      assert_equal ['dlopper'], scan('<span data-mention="@dlopper"></span>')
    end
  end

  def test_journal_mention_sets_mentioned_users
    with_settings(text_formatting: 'CKEditor') do
      issue = Issue.find(1)
      issue.init_journal(User.find(2), '<p>Ping @dlopper</p>')
      assert issue.save

      assert_equal [User.find(3)], issue.current_journal.mentioned_users.to_a
    end
  end

  def test_quoted_reply_does_not_notify
    with_settings(text_formatting: 'CKEditor', notified_events: %w[issue_updated]) do
      issue = Issue.find(1)
      issue.init_journal(User.find(2), '<blockquote><p>@dlopper wrote</p></blockquote><p>ok</p>')
      assert issue.save

      assert_empty issue.current_journal.mentioned_users.to_a
    end
  end
end
