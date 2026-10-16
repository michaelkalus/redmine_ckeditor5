# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorIssueMentionBackrefTest < ActiveSupport::TestCase
  fixtures :projects, :users, :email_addresses, :user_preferences, :members, :member_roles, :roles,
           :trackers, :projects_trackers, :enabled_modules, :issue_statuses, :issues, :journals,
           :journal_details, :enumerations, :workflows, :watchers

  Backref = RedmineCkeditor::IssueMentionBackref

  def setup
    User.current = nil
    ActionMailer::Base.deliveries.clear
  end

  def ckeditor(&) = with_settings(text_formatting: 'CKEditor', notified_events: %w[issue_updated issue_note_added], &)

  def add_note(issue, notes, user: User.find(2), private_notes: false)
    issue.reload
    issue.init_journal(user, notes)
    issue.private_notes = private_notes
    issue.save!
    issue.current_journal
  end

  def backrefs(issue_id)
    Journal.where(journalized_type: 'Issue', journalized_id: issue_id)
           .select { |journal| journal.notes.to_s.include?(Backref::MARKER) }
  end

  def test_issue_ids_ignores_code_quotes_attributes_and_non_boundaries
    html = '<p>#2, see a#3 &amp;#4 #5x</p><pre>#6</pre><blockquote>#7</blockquote><a href="/issues/8">#9</a>'

    assert_equal [2, 9], Backref.issue_ids(html)
  end

  def test_note_creates_backref_by_the_note_author
    ckeditor do
      journal = add_note(Issue.find(1), '<p>See #2</p>')

      refs = backrefs(2)
      assert_equal 1, refs.size
      assert_equal User.find(2), refs.first.user
      assert_includes refs.first.notes, %(data-ckeditor-backref="journal:#{journal.id}")
      assert_includes refs.first.notes, "/issues/1#change-#{journal.id}"
      refute_includes refs.first.notes, Issue.find(1).subject
    end
  end

  def test_backref_sends_standard_notification
    ckeditor do
      add_note(Issue.find(1), '<p>See #2</p>')

      assert ActionMailer::Base.deliveries.any? { |mail| mail.subject.include?('#2') }
    end
  end

  def test_backref_does_not_recurse_into_source
    ckeditor do
      add_note(Issue.find(1), '<p>See #2</p>')

      assert_empty backrefs(1)
    end
  end

  def test_skips_self_mention_private_note_and_private_source
    ckeditor do
      add_note(Issue.find(1), '<p>#1</p>')
      add_note(Issue.find(1), '<p>#2</p>', private_notes: true)
      Issue.find(3).update_column(:is_private, true)
      add_note(Issue.find(3), '<p>#2</p>')

      assert_empty backrefs(1)
      assert_empty backrefs(2)
    end
  end

  def test_skips_targets_the_actor_cannot_see_or_comment
    ckeditor do
      Issue.any_instance.stubs(:visible?).returns(false)
      add_note(Issue.find(1), '<p>#2</p>')
      Issue.any_instance.unstub(:visible?)
      Issue.any_instance.stubs(:notes_addable?).returns(false)
      add_note(Issue.find(1), '<p>#3</p>')

      assert_empty backrefs(2)
      assert_empty backrefs(3)
    end
  end

  def test_two_notes_create_two_backrefs
    ckeditor do
      add_note(Issue.find(1), '<p>#2</p>')
      add_note(Issue.find(1), '<p>again #2</p>')

      assert_equal 2, backrefs(2).size
    end
  end

  def test_reprocessing_same_journal_is_idempotent
    ckeditor do
      journal = add_note(Issue.find(1), '<p>#2</p>')
      Backref.from_journal(journal)

      assert_equal 1, backrefs(2).size
    end
  end

  def test_description_change_only_backrefs_new_ids
    ckeditor do
      issue = Issue.find(1)
      issue.init_journal(User.find(2))
      issue.description = '<p>#2</p>'
      issue.save!
      issue.reload
      issue.init_journal(User.find(2))
      issue.description = '<p>#2 and #3</p>'
      issue.save!

      assert_equal 1, backrefs(2).size
      assert_equal 1, backrefs(3).size
      assert_includes backrefs(3).first.notes, 'data-ckeditor-backref="issue:1"'
    end
  end

  def test_failure_does_not_break_the_source_save
    ckeditor do
      Backref.stubs(:note_html).raises(RuntimeError, 'boom')

      assert_nothing_raised { add_note(Issue.find(1), '<p>#2</p>') }
      assert_empty backrefs(2)
    end
  end

  def test_disabled_setting_and_other_formats_do_nothing
    with_settings(text_formatting: 'CKEditor', plugin_redmine_ckeditor: {'issue_mention_backref' => '0'}) do
      add_note(Issue.find(1), '<p>#2</p>')
    end
    with_settings(text_formatting: 'common_mark') { add_note(Issue.find(1), '#3') }

    assert_empty backrefs(2)
    assert_empty backrefs(3)
  end
end
